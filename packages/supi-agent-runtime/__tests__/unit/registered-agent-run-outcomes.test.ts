import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const transcriptFsGate = vi.hoisted(() => {
  let gateNextMessageWrite = false;
  let messageWriteStarted: (() => void) | undefined;
  let releaseMessageWrite: (() => void) | undefined;

  return {
    pauseNextMessageWrite: () => {
      gateNextMessageWrite = true;
    },
    waitForMessageWrite: () =>
      new Promise<void>((resolve) => {
        messageWriteStarted = resolve;
      }),
    gateMessageWrite: async (record: string) => {
      if (!gateNextMessageWrite || !record.includes('"kind":"message"')) return;
      gateNextMessageWrite = false;
      messageWriteStarted?.();
      await new Promise<void>((resolve) => {
        releaseMessageWrite = resolve;
      });
    },
    releaseMessageWrite: () => {
      releaseMessageWrite?.();
      releaseMessageWrite = undefined;
    },
    reset: () => {
      gateNextMessageWrite = false;
      messageWriteStarted = undefined;
      releaseMessageWrite = undefined;
    },
  };
});

vi.mock("node:fs/promises", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:fs/promises")>();
  const appendFile = vi.fn(async (...args: Parameters<typeof original.appendFile>) => {
    await transcriptFsGate.gateMessageWrite(String(args[1]));
    return original.appendFile(...args);
  });
  return { ...original, appendFile };
});

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
let fakeTimersEnabled = false;

beforeEach(async () => {
  vi.clearAllMocks();
  transcriptFsGate.reset();
  registry = new AgentRunRegistry();
  tempDirectory = await mkdtemp(join(tmpdir(), "supi-registered-outcome-test-"));
  vi.stubEnv("TMPDIR", tempDirectory);
});

afterEach(async () => {
  transcriptFsGate.releaseMessageWrite();
  if (fakeTimersEnabled) await vi.runAllTimersAsync().catch(() => undefined);
  vi.useRealTimers();
  fakeTimersEnabled = false;
  await registry.clear();
  vi.unstubAllEnvs();
  await rm(tempDirectory, { recursive: true, force: true });
  transcriptFsGate.reset();
});

function registration(runKey: string) {
  return {
    metadata: {
      runKey,
      batchId: "batch-1",
      taskId: "task-1",
      kind: "Reviewer",
      label: "change review",
      cwd: "/repo",
      modelId: "test-provider/test-model",
      thinkingLevel: "low" as const,
      tools: ["read"],
      startedAt: 1,
    },
  };
}

it("finishes transcript capture after a terminal failure", async () => {
  createHarness(mocks);
  const run = startRegisteredAgentRun({
    inputs: inputs(),
    prompt: "return no completion",
    completionResolver: () => undefined,
    registry,
    registration: registration("failed-run"),
  });

  await expect(run.result).resolves.toMatchObject({
    kind: "failed",
    failureCode: "missing-completion",
  });
  expect(registry.snapshot().runs[0]?.transcriptSource?.getStatus().status).toBe("complete");
});

it("completes stop after bounded disposal when the prompt does not settle", async () => {
  const { session, runtime } = createHarness(mocks);
  session.prompt.mockImplementationOnce(async (_prompt, options) => {
    session.isStreaming = true;
    options?.preflightResult?.(true);
    await new Promise<void>(() => undefined);
  });
  const run = startRegisteredAgentRun({
    inputs: inputs(),
    prompt: "wait for an external response",
    completionResolver: () => "done",
    registry,
    registration: registration("canceled-run"),
  });
  await vi.waitFor(() => expect(session.prompt).toHaveBeenCalledOnce());

  await run.stop();

  await expect(run.result).resolves.toMatchObject({ kind: "canceled" });
  expect(runtime.dispose).toHaveBeenCalledOnce();
  expect(run.steeringAvailable).toBe(false);
  expect(registry.snapshot().runs[0]?.transcriptSource?.getStatus().status).toBe("complete");
});

it("stops after bounded disposal while a transcript message write is pending", async () => {
  const { session, runtime } = createHarness(mocks);
  const disposeSession = session.dispose;
  let resolveDisposalStarted!: () => void;
  const disposalStarted = new Promise<void>((resolve) => {
    resolveDisposalStarted = resolve;
  });
  runtime.dispose.mockImplementation(() => {
    resolveDisposalStarted();
    return new Promise<void>(() => undefined);
  });
  const capturedMessage = "The run was canceled while this message was written.";
  session.prompt.mockImplementationOnce(async (_prompt, options) => {
    session.isStreaming = true;
    options?.preflightResult?.(true);
    session.emit({
      type: "message_end",
      message: {
        role: "assistant",
        content: [{ type: "text", text: capturedMessage }],
      },
    });
    await new Promise<void>(() => undefined);
  });

  const messageWriteStarted = transcriptFsGate.waitForMessageWrite();
  transcriptFsGate.pauseNextMessageWrite();
  let run: ReturnType<typeof startRegisteredAgentRun> | undefined;
  try {
    run = startRegisteredAgentRun({
      inputs: inputs(),
      prompt: "remain active until stopped",
      completionResolver: () => "done",
      registry,
      registration: registration("pending-transcript-write-run"),
    });
    await vi.waitFor(() => expect(session.prompt).toHaveBeenCalledOnce());
    await messageWriteStarted;

    vi.useFakeTimers();
    fakeTimersEnabled = true;
    let resultSettled = false;
    void run.result.then(
      () => {
        resultSettled = true;
      },
      () => {
        resultSettled = true;
      },
    );
    let stopSettled = false;
    let stopFailed = false;
    void run.stop().then(
      () => {
        stopSettled = true;
      },
      () => {
        stopSettled = true;
        stopFailed = true;
      },
    );
    await disposalStarted;
    await vi.runAllTimersAsync();
    await Promise.resolve();

    expect(stopSettled).toBe(true);
    expect(stopFailed).toBe(false);
    expect(resultSettled).toBe(false);
    expect(runtime.dispose).toHaveBeenCalledOnce();
    expect(disposeSession).toHaveBeenCalledOnce();

    transcriptFsGate.releaseMessageWrite();
    vi.useRealTimers();
    fakeTimersEnabled = false;
    await expect(run.result).resolves.toMatchObject({ kind: "canceled" });
    const transcript = registry.snapshot().runs[0]?.transcriptSource;
    expect(transcript?.getStatus().status).toBe("complete");
    await expect(transcript?.load()).resolves.toMatchObject({
      status: "complete",
      messages: [
        {
          role: "assistant",
          content: [{ type: "text", text: capturedMessage }],
        },
      ],
    });
  } finally {
    transcriptFsGate.releaseMessageWrite();
    try {
      if (fakeTimersEnabled) await vi.runAllTimersAsync();
    } finally {
      vi.useRealTimers();
      fakeTimersEnabled = false;
    }
  }
});

it("finishes transcript capture after a timeout", async () => {
  vi.useFakeTimers();
  fakeTimersEnabled = true;
  const { session } = createHarness(mocks);
  session.prompt.mockImplementationOnce(async (_prompt, options) => {
    options?.preflightResult?.(true);
    await new Promise<void>(() => undefined);
  });
  const run = startRegisteredAgentRun({
    inputs: inputs(),
    prompt: "wait until timeout",
    completionResolver: () => "done",
    registry,
    registration: registration("timeout-run"),
    timeoutMs: 10,
  });
  await vi.waitFor(() => expect(session.prompt).toHaveBeenCalledOnce());
  await vi.advanceTimersByTimeAsync(10);

  await expect(run.result).resolves.toMatchObject({ kind: "timeout", timeoutMs: 10 });
  expect(registry.snapshot().runs[0]?.transcriptSource?.getStatus().status).toBe("complete");
});

it("keeps a successful run outcome when transcript storage fails", async () => {
  const { session } = createHarness(mocks);
  vi.stubEnv("TMPDIR", join(tempDirectory, "missing-parent"));
  const run = startRegisteredAgentRun({
    inputs: inputs(),
    prompt: "finish despite storage failure",
    completionResolver: () => "done",
    registry,
    registration: registration("storage-failure-run"),
  });

  await expect(run.result).resolves.toMatchObject({ kind: "success", value: "done" });
  expect(session.prompt).toHaveBeenCalledOnce();
  expect(registry.snapshot().runs[0]?.transcriptSource?.getStatus().status).toBe("incomplete");
});
