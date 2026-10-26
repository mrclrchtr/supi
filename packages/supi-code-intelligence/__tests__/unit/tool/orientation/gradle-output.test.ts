import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { type ExtensionContext, ProjectTrustStore } from "@earendil-works/pi-coding-agent";
import { writeSupiConfig } from "@mrclrchtr/supi-core/config";
import {
  createSettingsContributionCollector,
  SUPI_SETTINGS_COLLECT_EVENT,
} from "@mrclrchtr/supi-core/settings";
import { createPiMock, makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { queryGradleModel } from "../../../../src/analysis/gradle/query.ts";
import type { GradleModelQuery, GradleObservation } from "../../../../src/analysis/gradle/types.ts";
import { registerGradleObservations } from "../../../../src/gradle/consent.ts";
import { collectOverview } from "../../../../src/overview/collect.ts";
import { WorkspaceCodeIntelligenceSession } from "../../../../src/session/session.ts";
import { finishOrientationResult } from "../../../../src/tool/code_orientation/result.ts";

let root: string;
let home: string;
const captures = new Set<string>();
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "gradle-output-"));
  home = mkdtempSync(join(tmpdir(), "gradle-output-home-"));
  put("settings.gradle.kts", 'rootProject.name = "model"');
  put("notes.txt", "generic navigation");
  put(
    "gradle/wrapper/gradle-wrapper.properties",
    "distributionUrl=https\\://services.gradle.org/distributions/gradle-9.4.0-all.zip\n",
  );
  writeSupiConfig(
    { cwd: root, section: "code-intelligence", scope: "project" },
    { gradleObservation: "allow" },
  );
  new ProjectTrustStore(join(home, ".pi/agent")).set(root, true);
});
afterEach(() => {
  vi.unstubAllEnvs();
  for (const dir of [root, home, ...captures]) rmSync(dir, { force: true, recursive: true });
  captures.clear();
});
function put(file: string, content: string) {
  mkdirSync(dirname(join(root, file)), { recursive: true });
  writeFileSync(join(root, file), content);
}
function model(selectedRoot = root): GradleObservation {
  return {
    selectedRoot,
    query: "GradleBuild/BasicGradleProject",
    status: "complete",
    gradleVersion: "9.4.0",
    buildRoot: selectedRoot,
    projects: [
      {
        buildRoot: selectedRoot,
        path: ":",
        name: "reported-root",
        directory: selectedRoot,
        parentPath: null,
      },
      {
        buildRoot: selectedRoot,
        path: ":alpha",
        name: "duplicate",
        directory: join(home, "external-alpha"),
        parentPath: ":",
      },
      {
        buildRoot: selectedRoot,
        path: ":beta",
        name: "duplicate",
        directory: join(root, "custom-directory"),
        parentPath: ":",
      },
    ],
    includedBuilds: [{ buildRoot: join(home, "included") }],
  };
}
function setup(query: GradleModelQuery = async (selectedRoot) => model(selectedRoot)) {
  const pi = createPiMock();
  const ctx = makeCtx({ cwd: root, hasUI: false }) as unknown as ExtensionContext;
  const service = registerGradleObservations(pi as never, { homeDir: home, query }).forContext(ctx);
  const session = new WorkspaceCodeIntelligenceSession(root);
  session.setHomeDir(home);
  session.setProjectTrusted(true);
  session.setGradleObserver(service);
  const orient = async (input: object = {}, deadline?: number) =>
    finishOrientationResult(await session.orient(input, { deadline }));
  return { pi, ctx, service, orient };
}
function capture(text: string): string {
  const snapshot = text.match(/Captured details[^`]*`([^`]+)`/)?.[1];
  if (!snapshot) throw new Error("Expected captured details");
  captures.add(dirname(snapshot));
  return readFileSync(snapshot, "utf8");
}

it("Overview, Orientation, structured evidence, and captures distinguish model identity from declarations", async () => {
  const query = vi.fn<GradleModelQuery>(async (selectedRoot) => model(selectedRoot));
  const { service, orient } = setup(query);
  const overview = await collectOverview(root, true, home, service);
  const orientation = await orient();
  for (const text of [overview?.content ?? "", orientation.content]) {
    expect(text).toContain("Gradle model observation");
    expect(text).toContain("GradleBuild/BasicGradleProject");
    expect(text).toContain("9.4.0");
    expect(text).toContain(":alpha");
    expect(text).toContain(":beta");
    expect(text).toContain(join(home, "external-alpha"));
    expect(text).toContain("0 observed. manifest");
  }
  const captured = capture(orientation.content);
  expect(captured).toContain('"parentPath": ":"');
  expect(captured).toContain('"includedBuilds"');
  expect(captured).not.toContain('"path": "external-alpha');
  expect(JSON.stringify(orientation.details)).toContain("Logical project path");
  expect(query.mock.calls[0]?.[2]?.deadline).toBeLessThanOrEqual(Date.now() + 10_000);
});

it("discloses model row omissions consistently and retains the complete observation in captures", async () => {
  const { orient } = setup();
  const result = await orient({ maxResults: 1 });
  expect(result.content).toContain("showing 1 of 3; 2 omitted");
  expect(JSON.stringify(result.details)).toContain('"omittedCount":2');
  const captured = capture(result.content);
  expect(captured).toContain('"path": ":alpha"');
  expect(captured).toContain('"path": ":beta"');
  expect(result.content.length).toBeLessThanOrEqual(16000);
});

it("selects only the exact directory focus, never ancestors or independent nested builds", async () => {
  put("nested/settings.gradle", "");
  put(
    "nested/gradle/wrapper/gradle-wrapper.properties",
    "distributionUrl=https\\://services.gradle.org/distributions/gradle-9.4.0-all.zip",
  );
  put("plain/notes.txt", "");
  const query = vi.fn<GradleModelQuery>(async (selectedRoot) => model(selectedRoot));
  const { orient } = setup(query);
  const plain = await orient({ focus: { path: "plain" } });
  expect(plain.content).not.toContain("Gradle model observation");
  expect(query).not.toHaveBeenCalled();
  const nested = await orient({ focus: { path: "nested" } });
  expect(query.mock.calls.map(([selectedRoot]) => selectedRoot)).toEqual([join(root, "nested")]);
  expect(nested.content).toContain("Gradle-reported projects");
  capture(nested.content);
});

it.each(["8.14.3", "10.0.0"])(
  "discloses unsupported wrapper %s without losing navigation or substituting PATH",
  async (version) => {
    put(
      "gradle/wrapper/gradle-wrapper.properties",
      `distributionUrl=https\\://services.gradle.org/distributions/gradle-${version}-bin.zip`,
    );
    const query = vi.fn<GradleModelQuery>();
    const { orient } = setup(query);
    const result = await orient();
    expect(result.content).toContain("unsupported");
    expect(result.content).toContain("notes.txt");
    expect(result.content).not.toContain("## Gradle-reported projects");
    expect(query).not.toHaveBeenCalled();
    capture(result.content);
  },
);

it.each(["denied", "unsupported-wrapper", "missing-java", "model-failure"] as const)(
  "attributes %s to the evidence source that actually established the limitation",
  async (mode) => {
    const { orient } = setup(
      mode === "missing-java"
        ? queryGradleModel
        : async (selectedRoot) => ({
            selectedRoot,
            query: "GradleBuild/BasicGradleProject",
            status: "failed",
            stage: "query",
            reason: "fixture-model-failure",
          }),
    );
    if (mode === "denied")
      writeSupiConfig(
        { cwd: root, section: "code-intelligence", scope: "project" },
        { gradleObservation: "deny" },
      );
    if (mode === "unsupported-wrapper")
      put(
        "gradle/wrapper/gradle-wrapper.properties",
        "distributionUrl=https\\://services.gradle.org/distributions/gradle-8.14.3-bin.zip",
      );
    if (mode === "missing-java") {
      vi.stubEnv("JAVA_HOME", join(home, "missing-java"));
      vi.stubEnv("PATH", "");
    }
    const result = await orient();
    const attempted = mode === "model-failure";
    expect(result.details).toMatchObject({
      data: {
        sections: expect.arrayContaining([
          expect.objectContaining({
            key: "gradle.observation",
            provenance: [
              expect.objectContaining({ source: attempted ? "runtime" : "configuration" }),
            ],
          }),
        ]),
      },
    });
    expect(result.content).toContain(
      attempted ? "Model query was attempted." : "Model query was not run.",
    );
    const stage = mode === "denied" ? "authorization" : attempted ? "query" : "prerequisites";
    expect(capture(result.content)).toContain(`"stage": "${stage}"`);
  },
);

it("uses a real PATH installation when properties are absent, but does not execute unresolved shims", async () => {
  rmSync(join(root, "gradle"), { recursive: true });
  const install = join(home, "gradle-9.4.0");
  mkdirSync(join(install, "bin"), { recursive: true });
  mkdirSync(join(install, "lib"));
  writeFileSync(join(install, "bin/gradle"), "must not execute", { mode: 0o755 });
  writeFileSync(join(install, "lib/gradle-launcher-9.4.0.jar"), "");
  const bin = join(home, "bin");
  mkdirSync(bin);
  symlinkSync(join(install, "bin/gradle"), join(bin, "gradle"));
  vi.stubEnv("PATH", bin);
  const query = vi.fn<GradleModelQuery>(async (selectedRoot) => model(selectedRoot));
  const { orient } = setup(query);
  const result = await orient();
  capture(result.content);
  expect(query.mock.calls[0]?.[1]).toMatchObject({
    kind: "installation",
    value: realpathSync(install),
    version: "9.4.0",
  });
  rmSync(join(bin, "gradle"));
  writeFileSync(join(bin, "gradle"), "unresolved shim", { mode: 0o755 });
  const unresolved = await orient();
  capture(unresolved.content);
  expect(unresolved.content).toContain("shims are not executed");
  expect(query).toHaveBeenCalledOnce();
});

it.each(["unavailable", "failed", "interrupted", "timeout", "oversized"] as const)(
  "keeps generic navigation with truthful %s model limitations",
  async (status) => {
    const { orient } = setup(async (selectedRoot) => ({
      selectedRoot,
      query: "GradleBuild/BasicGradleProject",
      status,
      stage: "query",
      reason: "Test prerequisite or model failure",
    }));
    const result = await orient();
    expect(result.content).toContain("notes.txt");
    expect(result.content).toContain(`${status}: Test prerequisite or model failure`);
    expect(JSON.stringify(result.details)).toContain("Test prerequisite or model failure");
    expect(capture(result.content)).toContain(`"status": "${status}"`);
  },
);

it("keeps a helper prerequisite failure distinct from an attempted Gradle query", async () => {
  const javaHome = join(home, "fake-java");
  mkdirSync(join(javaHome, "bin"), { recursive: true });
  const failure = JSON.stringify({
    status: "unavailable",
    stage: "prerequisites",
    reason: "Selected root has no Gradle settings file",
  });
  writeFileSync(
    join(javaHome, "bin/java"),
    `#!${process.execPath}\nif (process.argv.includes('-version')) process.stderr.write('openjdk version "21.0.13"');\nelse process.stdout.write(${JSON.stringify(failure)});\n`,
    { mode: 0o755 },
  );
  vi.stubEnv("JAVA_HOME", javaHome);
  const { orient } = setup(queryGradleModel);
  const result = await orient();
  expect(result.content).toContain("Model query was not run.");
  expect(result.details).toMatchObject({
    data: {
      sections: expect.arrayContaining([
        expect.objectContaining({
          key: "gradle.observation",
          provenance: [expect.objectContaining({ source: "configuration" })],
        }),
      ]),
    },
  });
  expect(capture(result.content)).toContain('"stage": "prerequisites"');
});

it("discloses unknown query execution when Java starts but the helper fails before returning evidence", async () => {
  const javaHome = join(home, "fake-java");
  mkdirSync(join(javaHome, "bin"), { recursive: true });
  writeFileSync(
    join(javaHome, "bin/java"),
    `#!${process.execPath}\nif (process.argv.includes('-version')) process.stderr.write('openjdk version "21.0.13"');\nelse process.exit(1);\n`,
    { mode: 0o755 },
  );
  vi.stubEnv("JAVA_HOME", javaHome);
  const { orient } = setup(queryGradleModel);
  const result = await orient();
  expect(result.content).toContain("Model query execution is unknown.");
  expect(result.content).not.toContain("Model query was attempted.");
  expect(result.content).not.toContain("Model query was not run.");
  expect(result.content).toContain("Gradle helper exited with code 1");
  expect(capture(result.content)).toContain('"stage": "unknown"');
});

it("does not claim a query when the deadline expires after Java selection but before helper launch", async () => {
  const javaHome = join(home, "fake-java");
  const selected = join(home, "java-selected");
  mkdirSync(join(javaHome, "bin"), { recursive: true });
  writeFileSync(
    join(javaHome, "bin/java"),
    `#!${process.execPath}\nif (process.argv.includes('-version')) { require('node:fs').writeFileSync(${JSON.stringify(selected)}, ''); process.stderr.write('openjdk version "21.0.13"'); }\nelse throw new Error('Helper must not launch after the deadline');\n`,
    { mode: 0o755 },
  );
  vi.stubEnv("JAVA_HOME", javaHome);
  const { service } = setup(queryGradleModel);
  const clock = vi.spyOn(Date, "now").mockImplementation(() => (existsSync(selected) ? 20_000 : 0));
  try {
    expect(await service.observe(root, { deadline: 10_000 })).toMatchObject({
      status: "timeout",
      stage: "prerequisites",
    });
  } finally {
    clock.mockRestore();
  }
});

it("retains the actual Gradle version and initialization cause through the helper process boundary", async () => {
  const javaHome = join(home, "fake-java");
  mkdirSync(join(javaHome, "bin"), { recursive: true });
  const failure = JSON.stringify({
    status: "failed",
    stage: "query",
    reason: "fixture-initialization-failure",
    gradleVersion: "9.4.0",
  });
  writeFileSync(
    join(javaHome, "bin/java"),
    `#!${process.execPath}\nif (process.argv.includes('-version')) process.stderr.write('openjdk version "21.0.13"');\nelse process.stdout.write(${JSON.stringify(failure)});\n`,
    { mode: 0o755 },
  );
  vi.stubEnv("JAVA_HOME", javaHome);
  const { orient } = setup(queryGradleModel);
  const result = await orient();
  expect(capture(result.content)).toContain('"gradleVersion": "9.4.0"');
  expect(result.content).toContain("Gradle `9.4.0`");
  expect(result.content).toContain("fixture-initialization-failure");
  expect(result.content).toContain("notes.txt");
});

it("renders a failure reason once as single-line literal Markdown without doubled punctuation", async () => {
  const reason = [
    "fixture-render-failure.\n## untrusted <message> `text`",
    "![image](image.png)",
    "*emphasis* [help](https://example.invalid/help) \\path.",
  ].join(" ");
  const { orient } = setup(async (selectedRoot) => ({
    selectedRoot,
    query: "GradleBuild/BasicGradleProject",
    status: "failed",
    stage: "query",
    reason,
  }));
  const result = await orient();
  expect(result.content.match(/fixture-render-failure/g)).toHaveLength(1);
  expect(result.content).not.toContain("\n## untrusted");
  expect(result.content).toContain(
    [
      "`` failed: fixture-render-failure. ## untrusted <message> `text`",
      "![image](image.png)",
      "*emphasis* [help](https://example.invalid/help) \\path. `` runtime",
    ].join(" "),
  );
  expect(result.content).not.toContain(".. runtime");
  expect(capture(result.content)).toContain(`"reason": ${JSON.stringify(reason)}`);
});

it("keeps navigation when no compatible Java is installed", async () => {
  vi.stubEnv("JAVA_HOME", join(home, "missing-java"));
  vi.stubEnv("PATH", "");
  const { orient } = setup(queryGradleModel);
  const result = await orient();
  expect(result.content).toContain("No compatible installed Java runtime");
  expect(result.content).toContain("notes.txt");
  capture(result.content);
});

it.each(["oversized", "timeout"] as const)(
  "bounds the actual helper process on %s output or execution",
  async (mode) => {
    const javaHome = join(home, "fake-java");
    mkdirSync(join(javaHome, "bin"), { recursive: true });
    writeFileSync(
      join(javaHome, "bin/java"),
      `#!${process.execPath}\nif (process.argv.includes('-version')) process.stderr.write('openjdk version "21.0.13"');\nelse ${mode === "oversized" ? "process.stdout.write(Buffer.alloc(1_048_577));" : "setTimeout(() => {}, 30000);"}\n`,
      { mode: 0o755 },
    );
    vi.stubEnv("JAVA_HOME", javaHome);
    const { orient } = setup(queryGradleModel);
    const result = await orient({}, Date.now() + (mode === "timeout" ? 500 : 1500));
    expect(result.content).toContain(`${mode}:`);
    expect(result.content).toContain("notes.txt");
    expect(result.content).toContain("Model query execution is unknown.");
    expect(capture(result.content)).toContain('"stage": "unknown"');
  },
);

it("does not publish a completed model after live Deny and uses new settings for the next query", async () => {
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const query = vi.fn<GradleModelQuery>(async (selectedRoot, _runtime, control) => {
    entered();
    await new Promise<void>((resolve) =>
      control?.signal?.addEventListener("abort", () => resolve(), { once: true }),
    );
    return model(selectedRoot);
  });
  const { pi, ctx, orient } = setup(query);
  const pending = orient();
  await started;
  const collector = createSettingsContributionCollector();
  pi.events.emit(SUPI_SETTINGS_COLLECT_EVENT, collector);
  const settings = collector.result().modules[0];
  if (!settings) throw new Error("Missing settings");
  await settings.apply({
    cwd: root,
    scope: "project",
    ctx,
    fieldKey: "gradleObservation",
    action: { kind: "set", value: "deny" },
  });
  const interrupted = await pending;
  expect(interrupted.content).toContain("interrupted");
  expect(interrupted.content).not.toContain("reported-root");
  capture(interrupted.content);
  const denied = await orient();
  expect(denied.content).toContain("denied");
  capture(denied.content);
  expect(query).toHaveBeenCalledOnce();
});
