import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAgentSession: vi.fn(),
  createAgentSessionRuntime: vi.fn(),
  createModelRuntime: vi.fn(async () => ({
    getProviders: vi.fn(() => []),
    registerNativeProvider: vi.fn(),
    refresh: vi.fn(async () => undefined),
  })),
}));

vi.mock("@earendil-works/pi-coding-agent", async (original) => ({
  ...(await original()),
  ModelRuntime: { create: mocks.createModelRuntime },
  createAgentSession: mocks.createAgentSession,
  createAgentSessionRuntime: mocks.createAgentSessionRuntime,
}));

import { AgentRunRegistry, startRegisteredAgentRun } from "../../src/api.ts";
import { createHarness, inputs } from "../helpers/agent-run-harness.ts";

let registry: AgentRunRegistry;
let tempDirectory: string;

beforeEach(async () => {
  vi.clearAllMocks();
  registry = new AgentRunRegistry();
  tempDirectory = await mkdtemp(join(tmpdir(), "supi-registered-registry-test-"));
  vi.stubEnv("TMPDIR", tempDirectory);
});

afterEach(async () => {
  await registry.clear();
  vi.unstubAllEnvs();
  vi.useRealTimers();
  await rm(tempDirectory, { recursive: true, force: true });
});

function registration(runKey?: string) {
  return {
    metadata: {
      ...(runKey ? { runKey } : {}),
      taskId: "task-1",
      kind: "Agent Run",
      label: "explore",
      cwd: "/repo",
      modelId: "test-provider/test-model",
      thinkingLevel: "low" as const,
      tools: ["read"],
      startedAt: 1,
    },
  };
}

it("runs without registry tracking when no registry is supplied", async () => {
  const { session } = createHarness(mocks);
  const run = startRegisteredAgentRun({
    inputs: inputs(),
    prompt: "complete without a viewer",
    completionResolver: () => "done",
    registration: registration(),
  });

  await expect(run.result).resolves.toMatchObject({ kind: "success", value: "done" });
  expect(run.runKey).toMatch(/^[\da-f-]{36}$/i);
  expect(session.prompt).toHaveBeenCalledOnce();
  expect(await readdir(tempDirectory)).toEqual([]);
});

it("stops a run when its registry is closed", async () => {
  const { session } = createHarness(mocks);
  await registry.clear();
  const run = startRegisteredAgentRun({
    inputs: inputs(),
    prompt: "must not bypass the closed registry",
    completionResolver: () => "done",
    registry,
    registration: registration("closed-registry-run"),
  });

  await expect(run.result).resolves.toMatchObject({ kind: "canceled" });
  expect(run.runKey).toBe("closed-registry-run");
  expect(session.prompt).not.toHaveBeenCalled();
  expect(registry.snapshot().runs).toEqual([]);
});

it("removes transcript files when the containing session shuts down", async () => {
  const { session } = createHarness(mocks);
  session.prompt.mockImplementationOnce(async (_prompt, options) => {
    session.isStreaming = true;
    options?.preflightResult?.("started");
    await new Promise<void>(() => undefined);
  });
  const run = startRegisteredAgentRun({
    inputs: inputs(),
    prompt: "remain active until shutdown",
    completionResolver: () => "done",
    registry,
    registration: registration("shutdown-run"),
  });
  await vi.waitFor(() => expect(session.prompt).toHaveBeenCalledOnce());
  const transcript = registry.snapshot().runs[0]?.transcriptSource;
  expect(transcript).toBeDefined();
  expect(await readdir(tempDirectory)).toHaveLength(1);

  await registry.clear();

  await expect(run.result).resolves.toMatchObject({ kind: "canceled" });
  expect(await readdir(tempDirectory)).toEqual([]);
  await expect(transcript?.load()).resolves.toMatchObject({ status: "incomplete" });
});
