import { chmod, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { discoverAntigravityAvailability } from "../../src/availability.ts";
import { ConversationHandleStore } from "../../src/conversation/handles.ts";
import { getIsolatedAntigravityPaths } from "../../src/isolated-home.ts";
import { runAntigravityConversation } from "../../src/process/runner.ts";
import { ANTIGRAVITY_ANSWER_SCHEMA } from "../../src/structured-output.ts";
import { buildAntigravityResult } from "../../src/tool/antigravity_run/result.ts";
import { fixtureDirectory } from "../helpers/test-paths.ts";

const fakeDirectory = fixtureDirectory(import.meta.dirname);
const fakeCommand = join(fakeDirectory, "agy");
const schema = ANTIGRAVITY_ANSWER_SCHEMA as Record<string, unknown>;
const roots: string[] = [];

beforeEach(async () => {
  await chmod(fakeCommand, 0o755);
  const root = await mkdtemp(join(tmpdir(), "supi-antigravity-integration-"));
  roots.push(root);
  vi.stubEnv("PI_CODING_AGENT_DIR", root);
  vi.stubEnv("PATH", `${fakeDirectory}:${process.env.PATH ?? ""}`);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function runFixtureConversation(
  paths: ReturnType<typeof getIsolatedAntigravityPaths>,
  prompt: string,
  options: {
    signal?: AbortSignal;
    timeoutMs?: number;
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
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("supi-antigravity-schema-"))
    .map((entry) => entry.name)
    .sort();
}

describe("antigravity_run process integration", () => {
  it("discovers models and completes a new conversation", async () => {
    const paths = getIsolatedAntigravityPaths();
    const availability = await discoverAntigravityAvailability({ paths });
    expect(availability.status).toBe("available");
    if (availability.status !== "available") return;
    expect(availability.catalogue).toEqual(["gemini-3.8-flash-low", "gemini-3.1-pro-high"]);

    const facts = await runAntigravityConversation({
      paths,
      cwd: paths.consultationWorkspace,
      prompt: "hello",
      model: "gemini-3.8-flash-low",
      schema,
    });
    expect(facts.conversationId).toBe("fake-conversation");
    expect(facts.successfulToolNames).toEqual(["search_web"]);
    expect(facts.answer.sources[0]?.url).toMatch(/^https:\/\//);
  });

  it("reports permission denials and observed workspace activity", async () => {
    const paths = getIsolatedAntigravityPaths();
    const permissionFacts = await runFixtureConversation(paths, "permission");
    expect(permissionFacts.permissionDenials).toBe(1);
    expect(permissionFacts.successfulToolNames).toEqual([]);

    await writeFile(join(paths.consultationWorkspace, "README.md"), "fixture\n");
    const workspaceFacts = await runFixtureConversation(paths, "workspace");
    expect(workspaceFacts.successfulToolNames).toEqual(["read_file"]);
    expect(workspaceFacts.observedWorkspacePathHashes).toHaveLength(1);

    const handles = new ConversationHandleStore();
    const handle = handles.create({
      rawAntigravityId: permissionFacts.conversationId,
      model: "gemini-3.8-flash-low",
      canonicalWorkingDirectory: paths.consultationWorkspace,
      workspaceAccess: false,
      cliVersion: "1.1.25",
    });
    const permissionResult = buildAntigravityResult({
      facts: permissionFacts,
      handle,
      durationMs: 1,
    });
    const text = permissionResult.content.find((item) => item.type === "text")?.text ?? "";
    expect(text).toContain("denied by permissions");
    const workspaceResult = buildAntigravityResult({
      facts: workspaceFacts,
      handle,
      durationMs: 1,
    });
    expect(workspaceResult.details.observedWorkspaceEvidence).toHaveLength(1);
  });

  it("rejects malformed, oversized, failed-status, and non-zero process output", async () => {
    const paths = getIsolatedAntigravityPaths();
    for (const prompt of ["malformed", "oversized", "fail"]) {
      await expect(runFixtureConversation(paths, prompt)).rejects.toMatchObject({
        name: "AntigravityProcessError",
      });
    }
    await expect(runFixtureConversation(paths, "exit-nonzero")).rejects.toMatchObject({
      name: "AntigravityProcessError",
      kind: "process",
      exitCode: 7,
      stderr: "fixture process failure",
    });
  });

  it("cancels and times out process groups and removes temporary schemas", async () => {
    const paths = getIsolatedAntigravityPaths();
    const schemaParent = roots[0] as string;
    const before = await schemaDirectories(schemaParent);
    const childPidFile = join(schemaParent, "child.pid");
    await expect(
      runFixtureConversation(paths, `spawn-child child-pid-file=${childPidFile} delay`, {
        timeoutMs: 300,
        schemaDirectoryParent: schemaParent,
      }),
    ).rejects.toMatchObject({ name: "AntigravityProcessError", kind: "timeout" });
    const childPid = Number(await readFile(childPidFile, "utf8"));
    expect(() => process.kill(childPid, 0)).toThrow();
    expect(
      (await schemaDirectories(schemaParent)).filter((name) => !before.includes(name)),
    ).toEqual([]);

    const controller = new AbortController();
    const canceled = runFixtureConversation(paths, "delay", {
      signal: controller.signal,
      schemaDirectoryParent: schemaParent,
      onProcessStart: () => controller.abort(),
    });
    await expect(canceled).rejects.toMatchObject({
      name: "AntigravityProcessError",
      kind: "cancelled",
    });
    expect(
      (await schemaDirectories(schemaParent)).filter((name) => !before.includes(name)),
    ).toEqual([]);
  });

  it("supports parallel independent processes and classifies a missing executable", async () => {
    const paths = getIsolatedAntigravityPaths();
    const parallel = await Promise.all([
      runFixtureConversation(paths, "parallel one"),
      runFixtureConversation(paths, "parallel two"),
    ]);
    expect(parallel).toHaveLength(2);
    expect(parallel.every((facts) => facts.conversationId === "fake-conversation")).toBe(true);

    vi.stubEnv("PATH", join(roots[0] as string, "missing"));
    await expect(runFixtureConversation(paths, "missing executable")).rejects.toMatchObject({
      name: "AntigravityProcessError",
      kind: "missing",
    });
  });

  it("continues one conversation with the raw ID while returning an opaque handle", async () => {
    const paths = getIsolatedAntigravityPaths();
    const first = await runAntigravityConversation({
      paths,
      cwd: paths.consultationWorkspace,
      prompt: "first",
      model: "gemini-3.8-flash-low",
      schema,
    });
    const handles = new ConversationHandleStore();
    const handle = handles.create({
      rawAntigravityId: first.conversationId,
      model: "gemini-3.8-flash-low",
      canonicalWorkingDirectory: paths.consultationWorkspace,
      workspaceAccess: false,
      cliVersion: "1.1.25",
    });
    const continued = await runAntigravityConversation({
      paths,
      cwd: paths.consultationWorkspace,
      prompt: "follow this conversation",
      model: handle.model,
      conversationId: handle.rawAntigravityId,
      schema,
    });
    expect(continued.conversationId).toBe(handle.rawAntigravityId);
    const result = buildAntigravityResult({ facts: continued, handle, durationMs: 1 });
    const text = result.content.find((item) => item.type === "text")?.text ?? "";
    expect(text).toContain("prior consultation");
    expect(result.details.rawAntigravityId).toBe("fake-conversation");
  });
});
