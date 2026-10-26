import org.gradle.tooling.CancellationToken;
import org.gradle.tooling.CancellationTokenSource;
import org.gradle.tooling.GradleConnectionException;
import org.gradle.tooling.GradleConnector;
import org.gradle.tooling.ModelBuilder;
import org.gradle.tooling.ProjectConnection;
import org.gradle.tooling.model.UnsupportedMethodException;
import org.gradle.tooling.model.build.BuildEnvironment;
import org.gradle.tooling.model.gradle.BasicGradleProject;
import org.gradle.tooling.model.gradle.GradleBuild;

import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.PrintStream;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Deque;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicLong;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Bounded, read-only Gradle build-structure probe for a separately managed JVM process.
 *
 * Arguments: selected-root, runtime-kind (distribution|installation), runtime-value,
 * deadline-epoch-milliseconds. A line containing "cancel" on stdin cancels the current
 * Tooling API request. The helper writes exactly one bounded JSON response to stdout.
 */
public final class GradleObservation {
    private static final int MAX_PROJECTS = 10_000;
    private static final int MAX_OUTPUT_BYTES = 1_048_576;
    private static final int MAX_LOG_BYTES = 64 * 1024;
    private static final int MAX_FAILURE_REASON_CHARS = 500;
    private static final Pattern VERSION_PATTERN = Pattern.compile("^(\\d+)(?:\\.|$)");
    private static final PrintStream JSON_OUTPUT = System.out;
    private static final PrintStream ORIGINAL_STDERR = System.err;
    private static final PrintStream LOG_OUTPUT = new PrintStream(
            new CappedLogOutputStream(ORIGINAL_STDERR, MAX_LOG_BYTES), true, StandardCharsets.UTF_8);

    private GradleObservation() {
    }

    public static void main(String[] args) {
        System.setOut(LOG_OUTPUT);
        System.setErr(LOG_OUTPUT);
        System.setProperty("org.slf4j.simpleLogger.defaultLogLevel", "warn");

        if (args.length != 4) {
            emitFailure("failed", "Expected selected-root, runtime-kind, runtime-value, and deadline-epoch-milliseconds");
            return;
        }

        final long deadlineEpochMillis;
        try {
            deadlineEpochMillis = Long.parseLong(args[3]);
        } catch (NumberFormatException error) {
            emitFailure("failed", "Deadline must be an epoch-millisecond integer");
            return;
        }

        final File selectedRoot;
        try {
            selectedRoot = new File(args[0]).getCanonicalFile();
        } catch (IOException error) {
            emitFailure("unavailable", "Selected root could not be canonicalized");
            return;
        }
        if (!selectedRoot.isDirectory()) {
            emitFailure("unavailable", "Selected root is not a directory");
            return;
        }
        if (!hasBuildDefinition(selectedRoot)) {
            emitFailure("unavailable", "Selected root has no Gradle settings file");
            return;
        }
        if (!"distribution".equals(args[1]) && !"installation".equals(args[1])) {
            emitFailure("failed", "Runtime kind must be distribution or installation");
            return;
        }

        final CancellationTokenSource tokenSource;
        try {
            tokenSource = GradleConnector.newCancellationTokenSource();
        } catch (Throwable error) {
            emitFailure("failed", safeMessage(error));
            return;
        }
        CancellationState cancellation = new CancellationState(tokenSource);
        startCancellationInput(cancellation);

        ScheduledExecutorService watchdog = Executors.newSingleThreadScheduledExecutor(task -> {
            Thread thread = new Thread(task, "gradle-observation-deadline");
            thread.setDaemon(true);
            return thread;
        });
        long delayMillis = Math.max(0L, deadlineEpochMillis - System.currentTimeMillis());
        if (delayMillis == 0L) {
            cancellation.request("timeout");
        } else {
            watchdog.schedule(() -> cancellation.request("timeout"), delayMillis, TimeUnit.MILLISECONDS);
        }

        CompletableFuture<String> work = new CompletableFuture<>();
        Thread worker = new Thread(() -> {
            try {
                work.complete(observe(selectedRoot, args[1], args[2], tokenSource.token()));
            } catch (Throwable error) {
                work.completeExceptionally(error);
            }
        }, "gradle-observation-model");
        worker.setDaemon(true);
        if (cancellation.reason() == null) {
            worker.start();
        }

        String response;
        try {
            long waitMillis = Math.max(1L, deadlineEpochMillis - System.currentTimeMillis());
            CompletableFuture.anyOf(work, cancellation.signal).get(waitMillis, TimeUnit.MILLISECONDS);
            if (cancellation.reason() != null) {
                response = failureJson(cancellation.reason(), cancellation.reason().equals("timeout")
                        ? "Gradle observation deadline expired"
                        : "Gradle observation was cancelled");
            } else {
                response = work.get();
            }
        } catch (TimeoutException error) {
            cancellation.request("timeout");
            response = failureJson("timeout", "Gradle observation deadline expired");
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            cancellation.request("interrupted");
            response = failureJson("interrupted", "Gradle observation was interrupted");
        } catch (ExecutionException error) {
            if (cancellation.reason() != null) {
                String reason = cancellation.reason();
                response = failureJson(reason, reason.equals("timeout")
                        ? "Gradle observation deadline expired"
                        : "Gradle observation was cancelled");
            } else {
                response = exceptionJson(error.getCause());
            }
        } catch (Throwable error) {
            response = exceptionJson(error);
        } finally {
            watchdog.shutdownNow();
        }

        if (!cancellation.commit()) {
            String reason = cancellation.reason();
            response = failureJson(reason, reason.equals("timeout")
                    ? "Gradle observation deadline expired"
                    : "Gradle observation was cancelled");
        }
        emit(response);
        if (cancellation.reason() != null) {
            // Tooling API cancellation is best-effort; the parent owns a final process-kill grace period.
            Runtime.getRuntime().halt(0);
        }
    }

    private static boolean hasBuildDefinition(File root) {
        return new File(root, "settings.gradle").isFile()
                || new File(root, "settings.gradle.kts").isFile();
    }

    private static String observe(
            File selectedRoot,
            String runtimeKind,
            String runtimeValue,
            CancellationToken token) throws Exception {
        GradleConnector connector = GradleConnector.newConnector().forProjectDirectory(selectedRoot);
        if (runtimeKind.equals("distribution")) {
            connector.useDistribution(URI.create(runtimeValue));
        } else {
            File installation = new File(runtimeValue).getCanonicalFile();
            if (!installation.isDirectory()) {
                throw new ObservationFailure("failed", "Selected Gradle installation is not a directory");
            }
            connector.useInstallation(installation);
        }

        File javaHome = new File(System.getProperty("java.home")).getCanonicalFile();
        try (ProjectConnection connection = connector.connect()) {
            ModelBuilder<BuildEnvironment> environmentRequest = configured(
                    connection.model(BuildEnvironment.class), token, javaHome);
            BuildEnvironment environment = environmentRequest.get();
            String gradleVersion = environment.getGradle().getGradleVersion();
            requireGradle9(gradleVersion);
            checkCancelled(token);

            // The only project model requested is GradleBuild; no task, dependency, or IDE models are queried.
            ModelBuilder<GradleBuild> buildRequest = configured(
                    connection.model(GradleBuild.class), token, javaHome);
            GradleBuild build = buildRequest.get();
            checkCancelled(token);
            return serialize(build, gradleVersion, token);
        } catch (ObservationFailure error) {
            throw error;
        } catch (IOException error) {
            throw new ObservationFailure("unavailable", "Gradle connection could not be closed");
        }
    }

    private static <T> ModelBuilder<T> configured(
            ModelBuilder<T> builder,
            CancellationToken token,
            File javaHome) {
        return builder.withCancellationToken(token)
                .setJavaHome(javaHome)
                .setStandardOutput(LOG_OUTPUT)
                .setStandardError(LOG_OUTPUT)
                .setStandardInput(new ByteArrayInputStream(new byte[0]))
                .setColorOutput(false)
                .withArguments("--console=plain");
    }

    private static void requireGradle9(String version) throws ObservationFailure {
        Matcher matcher = VERSION_PATTERN.matcher(version == null ? "" : version);
        if (!matcher.find()) {
            throw new ObservationFailure("unsupported", "Gradle version could not be identified");
        }
        try {
            int major = Integer.parseInt(matcher.group(1));
            if (major != 9) {
                throw new ObservationFailure("unsupported", "Only Gradle 9 is supported");
            }
        } catch (NumberFormatException error) {
            throw new ObservationFailure("unsupported", "Gradle version could not be identified");
        }
    }

    private static String serialize(GradleBuild build, String gradleVersion, CancellationToken token)
            throws Exception {
        String buildRoot = canonical(build.getBuildIdentifier().getRootDir());
        List<ProjectRecord> projects = new ArrayList<>();
        Deque<BasicGradleProject> pending = new ArrayDeque<>();
        pending.add(build.getRootProject());
        while (!pending.isEmpty()) {
            checkCancelled(token);
            BasicGradleProject project = pending.removeFirst();
            if (projects.size() >= MAX_PROJECTS) {
                throw new ObservationFailure("oversized", "Project count exceeds 10000");
            }
            String parentPath = project.getParent() == null
                    ? null
                    : project.getParent().getProjectIdentifier().getProjectPath();
            projects.add(new ProjectRecord(
                    canonical(project.getProjectIdentifier().getBuildIdentifier().getRootDir()),
                    project.getProjectIdentifier().getProjectPath(),
                    project.getName(),
                    canonical(project.getProjectDirectory()),
                    parentPath));
            for (BasicGradleProject child : project.getChildren()) {
                pending.addLast(child);
            }
        }
        projects.sort(Comparator.comparing(ProjectRecord::path));

        JsonWriter json = new JsonWriter();
        json.raw("{\"status\":\"complete\",\"gradleVersion\":");
        json.string(gradleVersion);
        json.raw(",\"buildRoot\":");
        json.string(buildRoot);
        json.raw(",\"projects\":[");
        for (int index = 0; index < projects.size(); index++) {
            checkCancelled(token);
            if (index > 0) {
                json.raw(",");
            }
            ProjectRecord project = projects.get(index);
            json.raw("{\"buildRoot\":");
            json.string(project.buildRoot());
            json.raw(",\"path\":");
            json.string(project.path());
            json.raw(",\"name\":");
            json.string(project.name());
            json.raw(",\"directory\":");
            json.string(project.directory());
            json.raw(",\"parentPath\":");
            if (project.parentPath() == null) {
                json.raw("null");
            } else {
                json.string(project.parentPath());
            }
            json.raw("}");
        }
        json.raw("],\"includedBuilds\":[");
        int index = 0;
        for (GradleBuild included : build.getIncludedBuilds()) {
            checkCancelled(token);
            if (index++ > 0) {
                json.raw(",");
            }
            json.raw("{\"buildRoot\":");
            json.string(canonical(included.getBuildIdentifier().getRootDir()));
            json.raw("}");
        }
        json.raw("]}");
        return json.toString();
    }

    private static void checkCancelled(CancellationToken token) throws ObservationFailure {
        if (token.isCancellationRequested()) {
            throw new ObservationFailure("interrupted", "Gradle observation was cancelled");
        }
    }

    private static String canonical(File file) throws IOException {
        return file.getCanonicalPath();
    }

    private static void startCancellationInput(CancellationState cancellation) {
        Thread reader = new Thread(() -> {
            try (BufferedReader input = new BufferedReader(
                    new InputStreamReader(System.in, StandardCharsets.UTF_8))) {
                String line;
                while ((line = input.readLine()) != null) {
                    if (line.trim().equals("cancel")) {
                        cancellation.request("interrupted");
                        return;
                    }
                }
            } catch (IOException ignored) {
                // The parent may close stdin while the observation is in progress.
            }
        }, "gradle-observation-cancellation-input");
        reader.setDaemon(true);
        reader.start();
    }

    private static String exceptionJson(Throwable error) {
        Throwable cause = unwrap(error);
        if (cause instanceof ObservationFailure failure) {
            return failureJson(failure.status, failure.getMessage());
        }
        if (cause instanceof JsonTooLargeException) {
            return failureJson("oversized", "Observation output exceeds 1 MiB");
        }
        if (cause instanceof UnsupportedMethodException) {
            return failureJson("unsupported", "Gradle does not support the requested model operation");
        }
        if (cause instanceof GradleConnectionException) {
            return failureJson("unavailable", safeMessage(cause));
        }
        if (cause instanceof InterruptedException) {
            return failureJson("interrupted", "Gradle observation was interrupted");
        }
        return failureJson("failed", safeMessage(cause));
    }

    private static Throwable unwrap(Throwable error) {
        Throwable current = error;
        while ((current instanceof ExecutionException || current instanceof java.util.concurrent.CompletionException)
                && current.getCause() != null) {
            current = current.getCause();
        }
        return current;
    }

    private static String safeMessage(Throwable error) {
        String message = error == null ? null : error.getMessage();
        if (message == null || message.isBlank()) {
            message = error == null ? "Gradle observation failed" : error.getClass().getSimpleName();
        }
        message = message.replaceAll("[\\p{Cntrl}&&[^\\n\\t]]", " ").trim();
        if (message.length() > MAX_FAILURE_REASON_CHARS) {
            message = message.substring(0, MAX_FAILURE_REASON_CHARS);
        }
        return message;
    }

    private static String failureJson(String status, String reason) {
        JsonWriter json = new JsonWriter();
        json.raw("{\"status\":");
        json.string(status);
        json.raw(",\"reason\":");
        json.string(reason == null ? "Gradle observation failed" : reason);
        json.raw("}");
        return json.toString();
    }

    private static void emitFailure(String status, String reason) {
        emit(failureJson(status, reason));
    }

    private static void emit(String response) {
        byte[] bytes = (response + "\n").getBytes(StandardCharsets.UTF_8);
        if (bytes.length > MAX_OUTPUT_BYTES) {
            bytes = (failureJson("oversized", "Observation output exceeds 1 MiB") + "\n")
                    .getBytes(StandardCharsets.UTF_8);
        }
        JSON_OUTPUT.write(bytes, 0, bytes.length);
        JSON_OUTPUT.flush();
    }

    private record ProjectRecord(String buildRoot, String path, String name, String directory, String parentPath) {
    }

    private static final class CancellationState {
        private final CancellationTokenSource tokenSource;
        private final CompletableFuture<String> signal = new CompletableFuture<>();
        private String cancellationReason;
        private boolean committed;

        private CancellationState(CancellationTokenSource tokenSource) {
            this.tokenSource = tokenSource;
        }

        private synchronized void request(String reason) {
            if (committed || cancellationReason != null) {
                return;
            }
            cancellationReason = reason;
            try {
                tokenSource.cancel();
            } finally {
                signal.complete(reason);
            }
        }

        private synchronized String reason() {
            return cancellationReason;
        }

        private synchronized boolean commit() {
            if (cancellationReason != null) {
                return false;
            }
            committed = true;
            return true;
        }
    }

    private static final class ObservationFailure extends Exception {
        private final String status;

        private ObservationFailure(String status, String message) {
            super(message);
            this.status = status;
        }
    }

    private static final class CappedLogOutputStream extends OutputStream {
        private final PrintStream target;
        private final long maxBytes;
        private final AtomicLong written = new AtomicLong();

        private CappedLogOutputStream(PrintStream target, long maxBytes) {
            this.target = target;
            this.maxBytes = maxBytes;
        }

        @Override
        public synchronized void write(int value) {
            if (written.get() < maxBytes) {
                target.write(value);
                written.incrementAndGet();
            }
        }

        @Override
        public synchronized void write(byte[] buffer, int offset, int length) {
            long available = Math.max(0L, maxBytes - written.get());
            int count = (int) Math.min(available, Math.max(0, length));
            if (count > 0) {
                target.write(buffer, offset, count);
                written.addAndGet(count);
            }
        }

        @Override
        public synchronized void flush() {
            target.flush();
        }
    }

    private static final class JsonWriter {
        private final StringBuilder value = new StringBuilder();
        private int utf8Bytes;

        private void raw(String text) {
            int addedBytes = text.getBytes(StandardCharsets.UTF_8).length;
            if ((long) utf8Bytes + addedBytes + 1 > MAX_OUTPUT_BYTES) {
                throw new JsonTooLargeException();
            }
            value.append(text);
            utf8Bytes += addedBytes;
        }

        private void string(String text) {
            raw("\"");
            for (int index = 0; index < text.length(); index++) {
                char character = text.charAt(index);
                switch (character) {
                    case '"' -> raw("\\\"");
                    case '\\' -> raw("\\\\");
                    case '\b' -> raw("\\b");
                    case '\f' -> raw("\\f");
                    case '\n' -> raw("\\n");
                    case '\r' -> raw("\\r");
                    case '\t' -> raw("\\t");
                    default -> {
                        if (character < 0x20) {
                            raw(String.format(Locale.ROOT, "\\u%04x", (int) character));
                        } else if (Character.isHighSurrogate(character)
                                && index + 1 < text.length()
                                && Character.isLowSurrogate(text.charAt(index + 1))) {
                            raw(text.substring(index, index + 2));
                            index++;
                        } else {
                            raw(String.valueOf(character));
                        }
                    }
                }
            }
            raw("\"");
        }

        @Override
        public String toString() {
            return value.toString();
        }
    }

    private static final class JsonTooLargeException extends RuntimeException {
        private JsonTooLargeException() {
            super("Observation output exceeds 1 MiB");
        }
    }
}
