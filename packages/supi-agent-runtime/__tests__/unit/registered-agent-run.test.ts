import { mkdtemp, rm } from "node:fs/promises";
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
  tempDirectory = await mkdtemp(join(tmpdir(), "supi-registered-run-test-"));
  vi.stubEnv("TMPDIR", tempDirectory);
});

afterEach(async () => {
  await registry.clear();
  vi.unstubAllEnvs();
  vi.useRealTimers();
  await rm(tempDirectory, { recursive: true, force: true });
});

it("registers a run before it calls the session observer", async () => {
  createHarness(mocks);
  let observedRunKeys: string[] = [];
  const run = startRegisteredAgentRun({
    inputs: inputs(),
    prompt: "inspect the package",
    completionResolver: () => "done",
    registry,
    registration: {
      metadata: {
        runKey: "run-1",
        batchId: "batch-1",
        taskId: "task-1",
        kind: "Agent Run",
        label: "explore",
        cwd: "/repo",
        modelId: "test-provider/test-model",
        thinkingLevel: "low",
        tools: ["read"],
        startedAt: 1,
      },
    },
    observer: () => {
      observedRunKeys = registry.snapshot().runs.map(({ runKey }) => runKey);
    },
  });

  await expect(run.result).resolves.toMatchObject({ kind: "success", value: "done" });
  expect(run.runKey).toBe("run-1");
  expect(observedRunKeys).toEqual(["run-1"]);
});

it("exposes progress, active steering, stop, and the terminal result", async () => {
  const { session } = createHarness(mocks);
  session.prompt.mockImplementationOnce(async (_prompt, options) => {
    session.isStreaming = true;
    options?.preflightResult?.(true);
    await new Promise<void>(() => undefined);
  });
  const run = startRegisteredAgentRun({
    inputs: inputs(),
    prompt: "hold the active prompt",
    completionResolver: () => "done",
    registry,
    registration: {
      metadata: {
        runKey: "controlled-run",
        taskId: "task-1",
        kind: "Agent Run",
        label: "explore",
        cwd: "/repo",
        modelId: "test-provider/test-model",
        thinkingLevel: "low",
        tools: ["read"],
        startedAt: 1,
      },
    },
  });
  const progressStatuses: string[] = [];
  const unsubscribe = run.subscribe((progress) => progressStatuses.push(progress.status));
  await vi.waitFor(() => expect(session.prompt).toHaveBeenCalledOnce());

  expect(run.steeringAvailable).toBe(true);
  await expect(run.steer("check the tests")).resolves.toBe("accepted");
  await run.stop();

  await expect(run.result).resolves.toMatchObject({ kind: "canceled" });
  expect(progressStatuses).toContain("starting");
  expect(progressStatuses).toContain("running");
  expect(progressStatuses).toContain("stopping");
  expect(progressStatuses.at(-1)).toBe("canceled");
  expect(run.steeringAvailable).toBe(false);
  unsubscribe();
});

it("waits for the finalized transcript before resolving the registered result", async () => {
  const { session } = createHarness(mocks);
  session.systemPrompt = "Child system prompt";
  session.prompt.mockImplementationOnce(async (_prompt, options) => {
    options?.preflightResult?.(true);
    session.emit({
      type: "message_end",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "The task is complete." }],
      },
    });
    session.emit({ type: "agent_settled" });
  });
  const run = startRegisteredAgentRun({
    inputs: inputs(),
    prompt: "inspect the package",
    completionResolver: () => "done",
    registry,
    registration: {
      metadata: {
        taskId: "task-1",
        kind: "Reviewer",
        label: "change review",
        cwd: "/repo",
        modelId: "test-provider/test-model",
        thinkingLevel: "low",
        tools: ["read"],
        startedAt: 1,
      },
    },
    transcriptSystemPrompt: "Reviewer Protocol",
  });

  await expect(run.result).resolves.toMatchObject({ kind: "success", value: "done" });
  const transcript = registry.snapshot().runs[0]?.transcriptSource;
  expect(transcript?.getStatus().status).toBe("complete");
  await expect(transcript?.load()).resolves.toMatchObject({
    systemPrompt: "Child system prompt",
    messages: [
      {
        role: "assistant",
        content: [{ type: "text", text: "The task is complete." }],
      },
    ],
  });
  expect(tempDirectory).toBeTruthy();
});

it("runs caller cleanup and transcript cleanup when caller cleanup throws", async () => {
  const { session } = createHarness(mocks);
  const unsubscribe = vi.fn();
  session.subscribe.mockImplementation(() => unsubscribe);
  const callerCleanup = vi.fn(() => {
    throw new Error("private observer cleanup error");
  });
  const run = startRegisteredAgentRun({
    inputs: inputs(),
    prompt: "inspect the package",
    completionResolver: () => "done",
    registry,
    registration: {
      metadata: {
        runKey: "cleanup-run",
        taskId: "task-1",
        kind: "Reviewer",
        label: "change review",
        cwd: "/repo",
        modelId: "test-provider/test-model",
        thinkingLevel: "low",
        tools: ["read"],
        startedAt: 1,
      },
    },
    observer: () => callerCleanup,
  });

  await expect(run.result).resolves.toMatchObject({ kind: "success", value: "done" });
  expect(callerCleanup).toHaveBeenCalledOnce();
  expect(unsubscribe).toHaveBeenCalledTimes(2);
  expect(registry.snapshot().runs[0]?.transcriptSource?.getStatus().status).toBe("complete");
});

it("detaches transcript observation when caller observer setup throws", async () => {
  const { session } = createHarness(mocks);
  const unsubscribes: Array<ReturnType<typeof vi.fn>> = [];
  session.subscribe.mockImplementation(() => {
    const unsubscribe = vi.fn();
    unsubscribes.push(unsubscribe);
    return unsubscribe;
  });
  const run = startRegisteredAgentRun({
    inputs: inputs(),
    prompt: "do not prompt",
    completionResolver: () => "done",
    registry,
    registration: {
      metadata: {
        runKey: "observer-error-run",
        taskId: "task-1",
        kind: "Reviewer",
        label: "change review",
        cwd: "/repo",
        modelId: "test-provider/test-model",
        thinkingLevel: "low",
        tools: ["read"],
        startedAt: 1,
      },
    },
    observer: () => {
      throw new Error("private observer setup error");
    },
  });

  await expect(run.result).resolves.toMatchObject({
    kind: "failed",
    failureCode: "session-not-ready",
  });
  expect(session.prompt).not.toHaveBeenCalled();
  expect(unsubscribes).toHaveLength(2);
  expect(unsubscribes.every((unsubscribe) => unsubscribe.mock.calls.length === 1)).toBe(true);
  expect(registry.snapshot().runs[0]?.transcriptSource?.getStatus().status).toBe("complete");
});
