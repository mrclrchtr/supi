# Gradle workspace observation helper

This standalone Java 17 process uses the pinned Gradle Tooling API 9.4.0. It accepts four arguments:

```text
GradleObservation <selected-root> <distribution|installation> <URI|installation-path> <deadline-epoch-milliseconds>
```

The parent chooses the Gradle runtime, performs consent/trust policy, and passes the runtime in. The helper does not resolve a wrapper or make policy decisions. `distribution` passes the given URI to `GradleConnector.useDistribution`; `installation` passes the given directory to `useInstallation`. The helper pins the Tooling API request JVM to its current `java.home`.

The helper requests `BuildEnvironment` first and accepts only Gradle 9 before asking for `GradleBuild`. It traverses the root build's `BasicGradleProject` children and reports only included-build root references. It does not query task, dependency, or IDE models. Output is one UTF-8 JSON object on stdout, limited to 1 MiB and 10,000 root-build projects. Gradle and process logs are redirected to stderr through a 64 KiB cap. Failure objects have one of these statuses: `unavailable`, `unsupported`, `failed`, `interrupted`, `timeout`, or `oversized`.

A line containing `cancel` on stdin requests Tooling API cancellation and produces an `interrupted` result. The deadline is an absolute Unix epoch timestamp in milliseconds; its watchdog requests token cancellation and produces `timeout`. Cancellation terminates this helper process after writing its JSON response so a parent process can use its own kill-after-grace policy if Tooling API shutdown stalls.

Build the reproducible helper and verify/download its pinned dependencies with:

```bash
./packages/supi-code-intelligence/gradle-helper/build.sh
```

The resulting helper JAR is `lib/supi-gradle-observation.jar`; the standalone Maven Tooling API and SLF4J artifacts remain adjacent in `lib/`. Fixed JAR entry ordering and timestamps make the helper artifact reproducible for a fixed Java compiler. Artifact URLs, SHA-256 values, and license notices are in `licenses/DEPENDENCIES.md`.

## Qualification

| Gradle distribution | Helper/client | Installed JVM | Platform | Verified cases |
| --- | --- | --- | --- | --- |
| 9.4.0 (`all`, pinned wrapper URL and SHA-256) | Tooling API 9.4.0, Java 17 bytecode | Eclipse Temurin 21.0.13+9 LTS | macOS arm64 | Groovy distribution selection; Kotlin installation selection; nested paths, renamed projects, duplicate leaf names, custom directories, external included reference; initialization failure, cancellation, expired deadline |
| 9.4.0 (`all`, same pin) | Same bundled helper | Amazon Corretto 21.0.9.10.1 | macOS arm64 | Same cases |

The TypeScript process adapter was also exercised against the real Groovy fixture: 8 projects and 1 included reference. Ordinary Vitest coverage controls the process boundary for missing Java, oversized output, active deadline expiry, trust/consent, live revocation, selection, result/capture consistency, and output budgets. These combinations do not establish qualification for every Gradle 9/JVM/platform combination. Java 17–24 is the conservative runtime-family intersection; actual qualification is limited to the rows above. Linux, Windows, other JVMs, and other Gradle 9 releases have not been qualified by this record.

The pinned fixtures contain no wrapper executable: the Tooling API selects the declared archive itself. `test-fixtures.py` copies both the build and its included sibling into temporary directories, exercises distribution mode first (which may download/cache the archive), then uses the resulting 9.4.0 installation. No independent included-build query is launched.

## Packaging and verification

The package's `files` list explicitly includes the helper JAR, standalone Maven Tooling API, SLF4J API/provider, source, rebuild script, and licenses. Runtime users need Java, not `javac` or a build step. `scripts/verify-tarball.mjs` checks these assets in both direct and transitively bundled Code Intelligence packages during `pnpm verify:ai`. The helper is compiled with `javac --release 17`; rebuilding requires an installed JDK and `curl`. Dependencies are checksum-verified, with no runtime dependency fetch by the helper launcher. Gradle itself may download its selected distribution or plugins after authorization.

Tooling API's standalone archive shades additional classes (Guava, Error Prone/JSpecify/JSR-305 annotations, `javax.inject`, Apache Commons, and ASM). The upstream complete Gradle LICENSE and NOTICE are retained alongside SLF4J's MIT license; not every component in the distribution-wide notice is used by this helper. See [dependency coordinates and checksums](licenses/DEPENDENCIES.md). No JVM or Gradle engine distribution is shipped.

Run the real pinned Groovy/Kotlin fixture acceptance test with:

```bash
python3 scripts/gradle-observation/test-fixtures.py
```
