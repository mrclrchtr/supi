import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAntigravityAdapter } from "../../src/agents/antigravity/adapter.ts";
import { getIsolatedAntigravityPaths } from "../../src/agents/antigravity/isolated-home.ts";
import { runAntigravityConversation } from "../../src/agents/antigravity/process/runner.ts";
import { ANTIGRAVITY_ANSWER_SCHEMA } from "../../src/agents/antigravity/structured-output.ts";
import { fixtureDirectory } from "../helpers/test-paths.ts";

const fakeDirectory = fixtureDirectory(import.meta.dirname);
const fakeCommand = join(fakeDirectory, "agy");
const schema = ANTIGRAVITY_ANSWER_SCHEMA as Record<string, unknown>;
const roots: string[] = [];

beforeEach(async () => {
  await chmod(fakeCommand, 0o755);
  const root = await mkdtemp(join(tmpdir(), "supi-consulting-adapter-"));
  roots.push(root);
  vi.stubEnv("PI_CODING_AGENT_DIR", root);
  vi.stubEnv("PATH", `${fakeDirectory}:${process.env.PATH ?? ""}`);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function runRawConversation(
  paths: ReturnType<typeof getIsolatedAntigravityPaths>,
  prompt: string,
  options: {
    signal?: AbortSignal;
    timeoutMs?: number;
    workspaceDirectory?: string;
    schemaDirectoryParent?: string;
    onProcessStart?: () => void;
  } = {},
) {
  return runAntigravityConversation({
    paths,
    cwd: paths.consultationWorkspace,
    prompt,
    model: "gemini-3.8-flash-low",
    schema,
    ...options,
  });
}

async function schemaDirectories(directory = tmpdir()): Promise<string[]> {
  return (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("supi-consulting-schema-"))
    .map((entry) => entry.name)
    .sort();
}

describe("Antigravity Consulting Agent adapter", () => {
  it("selects a temporary inspection agent only when starting a new conversation", async () => {
    const paths = getIsolatedAntigravityPaths();
    const adapter = createAntigravityAdapter(paths);
    const agentsDirectory = join(paths.homeDir, ".gemini", "config", "agents");
    await mkdir(agentsDirectory, { recursive: true });
    const unrelated = join(agentsDirectory, "unrelated.md");
    await writeFile(unrelated, "Leave this customization alone.\n");
    const options = {
      prompt: "begin",
      model: "gemini-3.8-flash-low",
      canonicalWorkingDirectory: paths.consultationWorkspace,
      workspaceAccess: false,
    };

    const first = await adapter.execute(options);
    expect(await readdir(agentsDirectory)).toEqual(["unrelated.md"]);
    const second = await adapter.execute({ ...options, continuation: first.continuation });
    expect(second.continuation).toBe(first.continuation);
    expect(second.answer.answer).toContain("prior consultation");
    const calls = (await readFile(join(paths.homeDir, ".fixture-agent-calls.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { agentName: string | null });
    expect(calls).toEqual([{ agentName: expect.any(String) }, { agentName: null }]);
    expect(await readdir(agentsDirectory)).toEqual(["unrelated.md"]);
    expect(await readFile(unrelated, "utf8")).toBe("Leave this customization alone.\n");
  });

  it("discovers and executes a bounded Consultation with opaque continuation state", async () => {
    const paths = getIsolatedAntigravityPaths();
    const adapter = createAntigravityAdapter(paths);
    const availability = await adapter.discover();
    expect(availability.status).toBe("available");
    if (availability.status !== "available") return;
    expect(availability.agent).toBe("antigravity");
    expect(availability.catalogue).toEqual(["gemini-3.8-flash-low", "gemini-3.1-pro-high"]);
    expect(Object.isFrozen(availability.catalogue)).toBe(true);

    const first = await adapter.execute({
      prompt: "first",
      model: "gemini-3.8-flash-low",
      canonicalWorkingDirectory: paths.consultationWorkspace,
      workspaceAccess: false,
    });
    expect(first.continuation).not.toContain("fixture-conversation-");
    expect(first.answer.sources[0]?.url).toMatch(/^https:\/\//);
    expect(first.usage).toEqual({ inputTokens: 4, outputTokens: 6 });
    expect(first.webUsed).toBe(true);
    expect(first.observedActivities).toEqual(["web"]);
    expect(first.activityCounts).toEqual({ web: 1, workspace: 0, other: 0 });

    const followUp = await adapter.execute({
      prompt: "follow this conversation",
      model: "gemini-3.8-flash-low",
      canonicalWorkingDirectory: paths.consultationWorkspace,
      workspaceAccess: false,
      continuation: first.continuation,
    });
    expect(followUp.continuation).toBe(first.continuation);
    expect(followUp.answer.answer).toContain("prior consultation");

    await expect(
      adapter.execute({
        prompt: "different-conversation",
        model: "gemini-3.8-flash-low",
        canonicalWorkingDirectory: paths.consultationWorkspace,
        workspaceAccess: false,
        continuation: first.continuation,
      }),
    ).rejects.toMatchObject({
      name: "ConsultingAgentError",
      kind: "conversation-mismatch",
    });
  });

  it("keeps tool-free follow-ups bound to the current request", async () => {
    const paths = getIsolatedAntigravityPaths();
    const adapter = createAntigravityAdapter(paths);
    const options = {
      model: "gemini-3.8-flash-low",
      canonicalWorkingDirectory: paths.consultationWorkspace,
      workspaceAccess: false,
    };
    const first = await adapter.execute({ ...options, prompt: "begin" });
    const followUp = await adapter.execute({
      ...options,
      prompt: "no-tools-follow-up: return the marker without using any tools",
      continuation: first.continuation,
    });
    expect(followUp.answer.answer).toContain("prior consultation");
  });

  it.each(["legacy", "different-profile"])(
    "rejects %s continuation state before starting even a hook probe",
    async (scenario) => {
      const paths = getIsolatedAntigravityPaths();
      const adapter = createAntigravityAdapter(paths);
      const first = await adapter.execute({
        prompt: "begin",
        model: "gemini-3.8-flash-low",
        canonicalWorkingDirectory: paths.consultationWorkspace,
        workspaceAccess: false,
      });
      const parts = first.continuation.split(".");
      parts[1] = "0".repeat(64);
      const continuation =
        scenario === "legacy"
          ? `agy1.${Buffer.from("fixture-old").toString("base64url")}`
          : parts.join(".");
      const onProcessStart = vi.fn();
      await expect(
        adapter.execute({
          prompt: "follow up",
          model: "gemini-3.8-flash-low",
          canonicalWorkingDirectory: paths.consultationWorkspace,
          workspaceAccess: true,
          continuation,
          onProcessStart,
        }),
      ).rejects.toMatchObject({
        kind: "invalid-continuation",
        message: expect.stringContaining("Start a new Consultation"),
      });
      expect(onProcessStart).not.toHaveBeenCalled();
    },
  );

  it.each([false, true])("isolates extra roots: %s", async (workspaceAccess) => {
    const paths = getIsolatedAntigravityPaths();
    const adapter = createAntigravityAdapter(paths);
    await adapter.discover();
    const cwd = await realpath(paths.consultationWorkspace);
    const firstRoot = join(cwd, "..", "first artifacts");
    const secondRoot = join(cwd, "..", "second-artifacts");
    await Promise.all([mkdir(firstRoot), mkdir(secondRoot)]);
    const baseRoots = workspaceAccess ? [cwd] : [];
    const execute = (directory?: string, continuation?: string) =>
      adapter.execute({
        prompt: `read-only-roots=${JSON.stringify(directory ? [...baseRoots, directory] : baseRoots)}`,
        model: "gemini-3.8-flash-low",
        canonicalWorkingDirectory: cwd,
        workspaceAccess,
        additionalReadOnlyDirectories: directory ? [directory, directory] : [],
        continuation,
      });
    const [first] = await Promise.all([execute(firstRoot), execute(secondRoot)]);
    const followUp = await execute(undefined, first.continuation);
    expect(followUp.continuation).toBe(first.continuation);
  });

  it("normalizes permission and workspace facts and reports hook process work", async () => {
    const paths = getIsolatedAntigravityPaths();
    const adapter = createAntigravityAdapter(paths);
    const permissionFacts = await adapter.execute({
      prompt: "permission",
      model: "gemini-3.8-flash-low",
      canonicalWorkingDirectory: paths.consultationWorkspace,
      workspaceAccess: false,
    });
    expect(permissionFacts.permissionDenials).toBe(1);
    expect(permissionFacts.webUsed).toBe(false);
    expect(permissionFacts.observedActivities).toEqual(["workspace"]);

    await writeFile(join(paths.consultationWorkspace, "README.md"), "fixture\n");
    let processStarts = 0;
    const workspaceFacts = await adapter.execute({
      prompt: "require-add-dir workspace",
      model: "gemini-3.8-flash-low",
      canonicalWorkingDirectory: paths.consultationWorkspace,
      workspaceAccess: true,
      onProcessStart: () => {
        processStarts += 1;
      },
    });
    expect(workspaceFacts.workspaceUsed).toBe(true);
    expect(workspaceFacts.observedActivities).toEqual(["workspace"]);
    expect(workspaceFacts.observedWorkspacePathHashes).toHaveLength(1);
    expect(processStarts).toBe(2);

    await writeFile(join(paths.consultationWorkspace, ".agy-hooks-active"), "active\\n");
    const lifecycle: string[] = [];
    let hookStarts = 0;
    await adapter.execute({
      prompt: "require-add-dir workspace",
      model: "gemini-3.8-flash-low",
      canonicalWorkingDirectory: paths.consultationWorkspace,
      workspaceAccess: true,
      onProcessStart: () => {
        hookStarts += 1;
        lifecycle.push(hookStarts === 1 ? "hook-start" : "paid-start");
      },
      onWarning: () => lifecycle.push("hook-warning"),
    });
    expect(lifecycle).toEqual(["hook-start", "hook-warning", "paid-start"]);
  });

  it("removes raw diagnostics from failed execution at the adapter interface", async () => {
    const paths = getIsolatedAntigravityPaths();
    const adapter = createAntigravityAdapter(paths);
    for (const [prompt, kind] of [
      ["exit-nonzero", "execution"],
      ["malformed", "invalid-response"],
    ] as const) {
      const failure = await adapter
        .execute({
          prompt,
          model: "gemini-3.8-flash-low",
          canonicalWorkingDirectory: paths.consultationWorkspace,
          workspaceAccess: false,
        })
        .catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(Error);
      expect(failure).toMatchObject({ name: "ConsultingAgentError", kind });
      expect(failure).not.toHaveProperty("stderr");
      expect(failure).not.toHaveProperty("cause");
      expect(String(failure)).not.toMatch(/fixture process failure|not-json/);
    }
  });

  it("sanitizes preparation failures and preserves cancellation at the adapter interface", async () => {
    const paths = getIsolatedAntigravityPaths();
    const adapter = createAntigravityAdapter(paths);
    const controller = new AbortController();
    const canceled = await adapter
      .execute({
        prompt: "delay",
        model: "gemini-3.8-flash-low",
        canonicalWorkingDirectory: paths.consultationWorkspace,
        workspaceAccess: false,
        signal: controller.signal,
        onProcessStart: () => controller.abort(),
      })
      .catch((error: unknown) => error);
    expect(canceled).toMatchObject({ name: "ConsultingAgentError", kind: "cancelled" });
    expect(canceled).not.toHaveProperty("stderr");
    expect(canceled).not.toHaveProperty("cause");

    await rm(paths.homeDir, { recursive: true });
    await writeFile(paths.homeDir, "not a directory");
    const failed = await adapter
      .execute({
        prompt: "begin",
        model: "gemini-3.8-flash-low",
        canonicalWorkingDirectory: paths.consultationWorkspace,
        workspaceAccess: false,
      })
      .catch((error: unknown) => error);
    expect(failed).toMatchObject({ name: "ConsultingAgentError", kind: "execution" });
    expect(failed).not.toHaveProperty("cause");
    expect(String(failed)).not.toContain(paths.homeDir);
  });

  it("cleans the inspection profile when schema setup fails before process start", async () => {
    const paths = getIsolatedAntigravityPaths();
    const notDirectory = join(roots[0] as string, "not-a-directory");
    await writeFile(notDirectory, "fixture");
    const onProcessStart = vi.fn();
    await expect(
      runRawConversation(paths, "begin", {
        schemaDirectoryParent: notDirectory,
        onProcessStart,
      }),
    ).rejects.toMatchObject({ name: "AntigravityProcessError" });
    expect(onProcessStart).not.toHaveBeenCalled();
    expect(await readdir(join(paths.homeDir, ".gemini", "config", "agents"))).toEqual([]);
  });

  it("cleans temporary profiles and schemas on process failure, timeout, and cancellation", async () => {
    const paths = getIsolatedAntigravityPaths();
    const agentsDirectory = join(paths.homeDir, ".gemini", "config", "agents");
    for (const prompt of ["malformed", "oversized", "fail"]) {
      await expect(runRawConversation(paths, prompt)).rejects.toMatchObject({
        name: "AntigravityProcessError",
      });
      expect(await readdir(agentsDirectory)).toEqual([]);
    }
    await expect(runRawConversation(paths, "exit-nonzero")).rejects.toMatchObject({
      name: "AntigravityProcessError",
      kind: "process",
      exitCode: 7,
      stderr: "fixture process failure",
    });
    expect(await readdir(agentsDirectory)).toEqual([]);

    const schemaParent = roots[0] as string;
    const before = await schemaDirectories(schemaParent);
    const childPidFile = join(schemaParent, "child.pid");
    await expect(
      runRawConversation(paths, `spawn-child child-pid-file=${childPidFile} delay`, {
        timeoutMs: 300,
        schemaDirectoryParent: schemaParent,
      }),
    ).rejects.toMatchObject({ name: "AntigravityProcessError", kind: "timeout" });
    const childPid = Number(await readFile(childPidFile, "utf8"));
    expect(() => process.kill(childPid, 0)).toThrow();
    expect(
      (await schemaDirectories(schemaParent)).filter((name) => !before.includes(name)),
    ).toEqual([]);
    expect(await readdir(agentsDirectory)).toEqual([]);

    const controller = new AbortController();
    const canceled = runRawConversation(paths, "delay", {
      signal: controller.signal,
      schemaDirectoryParent: schemaParent,
      onProcessStart: () => controller.abort(),
    });
    await expect(canceled).rejects.toMatchObject({
      name: "AntigravityProcessError",
      kind: "cancelled",
    });
    expect(await readdir(agentsDirectory)).toEqual([]);
    expect(await schemaDirectories(schemaParent)).toEqual(before);
  });

  it("supports parallel independent processes and reports a missing executable", async () => {
    const paths = getIsolatedAntigravityPaths();
    const adapter = createAntigravityAdapter(paths);
    const parallel = await Promise.all([
      adapter.execute({
        prompt: "parallel one",
        model: "gemini-3.8-flash-low",
        canonicalWorkingDirectory: paths.consultationWorkspace,
        workspaceAccess: false,
      }),
      adapter.execute({
        prompt: "parallel two",
        model: "gemini-3.8-flash-low",
        canonicalWorkingDirectory: paths.consultationWorkspace,
        workspaceAccess: false,
      }),
    ]);
    expect(parallel).toHaveLength(2);
    expect(parallel.every((facts) => facts.continuation.length > 0)).toBe(true);
    const calls = (await readFile(join(paths.homeDir, ".fixture-agent-calls.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { agentName: string });
    expect(calls).toHaveLength(2);
    expect(new Set(calls.map((call) => call.agentName)).size).toBe(2);
    expect(await readdir(join(paths.homeDir, ".gemini", "config", "agents"))).toEqual([]);

    vi.stubEnv("PATH", join(roots[0] as string, "missing"));
    await expect(
      adapter.execute({
        prompt: "missing executable",
        model: "gemini-3.8-flash-low",
        canonicalWorkingDirectory: paths.consultationWorkspace,
        workspaceAccess: false,
      }),
    ).rejects.toMatchObject({ name: "ConsultingAgentError", kind: "unavailable" });
    expect(await readdir(join(paths.homeDir, ".gemini", "config", "agents"))).toEqual([]);
  });
});
