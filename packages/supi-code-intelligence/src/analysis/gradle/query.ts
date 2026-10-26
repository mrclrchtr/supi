import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { CodeRequestControl } from "@mrclrchtr/supi-code-runtime/api";
import { findExecutable, GradlePrerequisiteError, requireGradle9 } from "./runtime.ts";
import type {
  GradleFailureStage,
  GradleModelQuery,
  GradleObservation,
  GradleProjectObservation,
  GradleRuntime,
} from "./types.ts";

const helperDirectory = fileURLToPath(new URL("../../../gradle-helper/lib/", import.meta.url));
const failureStates = new Set([
  "unavailable",
  "unsupported",
  "failed",
  "interrupted",
  "timeout",
  "oversized",
]);

/** Launch only the bundled Tooling API helper, with bounded pipes and the caller's deadline. */
export const queryGradleModel: GradleModelQuery = async (root, runtime, control) => {
  const base = { selectedRoot: root, query: "GradleBuild/BasicGradleProject" as const, runtime };
  const deadline = control?.deadline ?? Date.now() + 30_000;
  let stage: GradleFailureStage = "prerequisites";
  try {
    const java = await selectJava({ ...control, deadline });
    const output = await runProcess(
      java,
      [
        "-cp",
        `${helperDirectory}*`,
        "GradleObservation",
        root,
        runtime.kind,
        runtime.value,
        String(deadline),
      ],
      { ...control, deadline },
      {
        onSpawn: () => {
          stage = "unknown";
        },
      },
    );
    const result: unknown = JSON.parse(output);
    return validateModel(result, base, await fs.realpath(root));
  } catch (error) {
    return {
      ...base,
      stage,
      status:
        error instanceof ProcessFailure || error instanceof GradlePrerequisiteError
          ? error.status
          : "failed",
      reason: error instanceof Error ? error.message.slice(0, 500) : "Gradle model query failed.",
    };
  }
};

async function selectJava(control: CodeRequestControl): Promise<string> {
  const candidates = [
    process.env.JAVA_HOME
      ? path.join(process.env.JAVA_HOME, "bin", process.platform === "win32" ? "java.exe" : "java")
      : undefined,
    await findExecutable("java"),
  ];
  for (const candidate of new Set(candidates)) {
    if (!candidate) continue;
    try {
      const version = await runProcess(candidate, ["-version"], control, { captureError: true });
      const major = Number(version.match(/(?:openjdk|java) version "(\d+)/)?.[1]);
      // This conservative intersection is compatible with the Gradle 9 runtime family.
      if (major >= 17 && major <= 24) return candidate;
    } catch (error) {
      if (error instanceof ProcessFailure && ["timeout", "interrupted"].includes(error.status))
        throw error;
    }
  }
  throw new GradlePrerequisiteError(
    "unavailable",
    "No compatible installed Java runtime (17–24) found through JAVA_HOME or PATH. No JDK was installed.",
  );
}

class ProcessFailure extends Error {
  constructor(
    readonly status: "failed" | "interrupted" | "timeout" | "oversized",
    message: string,
  ) {
    super(message);
  }
}

function runProcess(
  command: string,
  args: string[],
  control: CodeRequestControl,
  options: { readonly captureError?: boolean; readonly onSpawn?: () => void } = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (control.signal?.aborted)
      return reject(new ProcessFailure("interrupted", "Gradle observation was cancelled."));
    const remaining = (control.deadline ?? Date.now() + 30_000) - Date.now();
    if (remaining <= 0)
      return reject(new ProcessFailure("timeout", "Gradle observation deadline expired."));
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"], shell: false });
    child.once("spawn", () => options.onSpawn?.());
    const chunks: Buffer[] = [];
    let bytes = 0;
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      control.signal?.removeEventListener("abort", abort);
      if (error) reject(error);
      else resolve(Buffer.concat(chunks).toString("utf8"));
    };
    const stop = (error: ProcessFailure) => {
      child.stdin.end("cancel\n");
      // Only this owned helper is killed; cancellation does not undo build side effects or stop daemons.
      const kill = setTimeout(() => child.kill("SIGKILL"), 250);
      kill.unref();
      child.once("close", () => clearTimeout(kill));
      finish(error);
    };
    const abort = () =>
      stop(
        new ProcessFailure(
          "interrupted",
          "Gradle observation was cancelled; prior side effects may remain.",
        ),
      );
    const timer = setTimeout(
      () =>
        stop(
          new ProcessFailure(
            "timeout",
            "Gradle observation deadline expired; cancellation was requested.",
          ),
        ),
      remaining,
    );
    control.signal?.addEventListener("abort", abort, { once: true });
    if (control.signal?.aborted) abort();
    const collect = (chunk: Buffer) => {
      if (settled) return;
      bytes += chunk.length;
      if (bytes > 1_048_576) {
        stop(
          new ProcessFailure(
            "oversized",
            "Gradle helper output exceeded 1 MiB; no model was retained.",
          ),
        );
        return;
      }
      chunks.push(chunk);
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", options.captureError ? collect : () => {});
    child.stdin.on("error", () => {});
    child.once("error", (error) => finish(error));
    child.once("close", (code) =>
      finish(
        code === 0
          ? undefined
          : new ProcessFailure("failed", `Gradle helper exited with code ${code ?? "unknown"}.`),
      ),
    );
  });
}

function validateModel(
  value: unknown,
  base: { selectedRoot: string; query: "GradleBuild/BasicGradleProject"; runtime: GradleRuntime },
  canonicalRoot: string,
): GradleObservation {
  if (!isRecord(value)) throw new Error("Gradle helper returned a non-object result.");
  if (failureStates.has(String(value.status)) && typeof value.reason === "string") {
    if (value.stage !== "prerequisites" && value.stage !== "query")
      throw new Error("Gradle helper returned an invalid failure stage.");
    return {
      ...base,
      status: value.status as "failed",
      stage: value.stage,
      reason: value.reason.slice(0, 500),
      gradleVersion: validateFailureVersion(value),
    };
  }
  if (
    value.status !== "complete" ||
    typeof value.gradleVersion !== "string" ||
    value.buildRoot !== canonicalRoot ||
    !Array.isArray(value.projects) ||
    !Array.isArray(value.includedBuilds)
  )
    throw new Error("Gradle helper returned an invalid model envelope.");
  requireGradle9(value.gradleVersion);
  const projects = validateProjects(value.projects, canonicalRoot);
  for (const included of value.includedBuilds)
    if (
      !isRecord(included) ||
      typeof included.buildRoot !== "string" ||
      !path.isAbsolute(included.buildRoot)
    )
      throw new Error("Gradle helper returned an invalid included-build reference.");
  return {
    ...base,
    status: "complete",
    gradleVersion: value.gradleVersion,
    buildRoot: canonicalRoot,
    projects,
    includedBuilds: value.includedBuilds as { buildRoot: string }[],
  };
}

function validateFailureVersion(value: Record<string, unknown>): string | undefined {
  if (value.gradleVersion === undefined) return undefined;
  if (
    value.stage !== "query" ||
    typeof value.gradleVersion !== "string" ||
    value.gradleVersion.length === 0 ||
    value.gradleVersion.length > 100
  )
    throw new Error("Gradle helper returned an invalid runtime version.");
  return value.gradleVersion;
}

function validateProjects(projects: unknown[], canonicalRoot: string): GradleProjectObservation[] {
  if (projects.length === 0 || projects.length > 10_000)
    throw new Error("Gradle helper returned an invalid project count.");
  const paths = new Set<string>();
  const validated: GradleProjectObservation[] = [];
  for (const project of projects) {
    assertProject(project, canonicalRoot);
    if (paths.has(project.path))
      throw new Error("Gradle helper returned a duplicate project identity.");
    paths.add(project.path);
    validated.push(project);
  }
  for (const project of validated) {
    const parent =
      project.path === ":" ? null : project.path.slice(0, project.path.lastIndexOf(":")) || ":";
    if (project.parentPath !== parent || (parent !== null && !paths.has(parent)))
      throw new Error("Gradle helper returned an invalid parent hierarchy.");
  }
  if (!paths.has(":")) throw new Error("Gradle helper omitted the root project.");
  return validated;
}

function assertProject(value: unknown, root: string): asserts value is GradleProjectObservation {
  if (
    !isRecord(value) ||
    value.buildRoot !== root ||
    typeof value.path !== "string" ||
    !/^:(?:[^:]+(?::[^:]+)*)?$/.test(value.path) ||
    typeof value.name !== "string" ||
    typeof value.directory !== "string" ||
    !path.isAbsolute(value.directory) ||
    !(value.parentPath === null || typeof value.parentPath === "string")
  )
    throw new Error("Gradle helper returned an invalid project identity or directory.");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
