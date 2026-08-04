import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAgentSession: vi.fn(),
  createAgentSessionRuntime: vi.fn(),
}));

vi.mock("@earendil-works/pi-coding-agent", async (original) => ({
  ...(await original()),
  createAgentSession: mocks.createAgentSession,
  createAgentSessionRuntime: mocks.createAgentSessionRuntime,
}));

import type { AgentSessionInputs } from "../../src/api.ts";
import { startAgentRun } from "../../src/api.ts";

function createHarness(entries: unknown[] = []) {
  const listeners = new Set<(event: { type: string; [key: string]: unknown }) => void>();
  const session = {
    modelRuntime: {},
    model: {},
    thinkingLevel: "low",
    isStreaming: false,
    messages: [{ role: "assistant", content: [{ type: "text", text: "done" }] }],
    sessionManager: { getEntries: () => entries },
    bindExtensions: vi.fn(async () => undefined),
    subscribe: vi.fn((listener: (event: { type: string; [key: string]: unknown }) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
    emit(event: { type: string; [key: string]: unknown }) {
      for (const listener of listeners) listener(event);
    },
    prompt: vi.fn(
      async (_prompt: string, options?: { preflightResult?: (accepted: boolean) => void }) => {
        session.isStreaming = true;
        options?.preflightResult?.(true);
        session.emit({ type: "agent_settled" });
        session.isStreaming = false;
      },
    ),
    steer: vi.fn(async () => undefined),
    abort: vi.fn(async () => undefined),
    dispose: vi.fn(),
    getActiveToolNames: vi.fn(() => ["read"]),
    getSessionStats: vi.fn(() => ({ tokens: { input: 0, output: 0, total: 0 } })),
    getLastAssistantText: vi.fn(() => "done"),
  };
  const runtime = { session, dispose: vi.fn(async () => undefined) };
  mocks.createAgentSession.mockResolvedValue({ session });
  mocks.createAgentSessionRuntime.mockImplementation(async (factory) => {
    await factory({ cwd: "/repo", agentDir: "/agent", sessionManager: {} });
    return runtime;
  });
  return { session, runtime };
}

function inputs(
  resourceLoader: Record<string, unknown> = { reload: vi.fn(async () => undefined) },
) {
  return {
    cwd: "/repo",
    model: {} as never,
    thinkingLevel: "low" as const,
    tools: ["read"],
    customTools: [],
    resourceLoader: resourceLoader as unknown as AgentSessionInputs["resourceLoader"],
    settingsManager: {} as AgentSessionInputs["settingsManager"],
  };
}

describe("Agent Run public lifecycle seam", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.useRealTimers());

  it("waits for an in-flight completion resolver before cancellation teardown", async () => {
    const harness = createHarness();
    let releaseCompletion!: (value: string) => void;
    const completion = new Promise<string>((resolve) => {
      releaseCompletion = resolve;
    });
    const resolverStarted = vi.fn();
    const run = startAgentRun({
      inputs: inputs(),
      prompt: "completion teardown",
      completionResolver: () => {
        resolverStarted();
        return completion;
      },
    });
    await vi.waitFor(() => expect(resolverStarted).toHaveBeenCalled());
    const stopped = run.stop();
    await Promise.resolve();
    expect(harness.runtime.dispose).not.toHaveBeenCalled();
    releaseCompletion("done");

    await stopped;
    await expect(run.result).resolves.toMatchObject({ kind: "canceled" });
    expect(harness.runtime.dispose).toHaveBeenCalledTimes(1);
  });

  it("does not start a prompt accepted after cancellation", async () => {
    const harness = createHarness();
    let acceptPreflight!: () => void;
    harness.session.prompt.mockImplementationOnce(
      async (_prompt, options) =>
        new Promise<void>(() => {
          acceptPreflight = () => {
            try {
              options?.preflightResult?.(true);
            } catch {
              // The runtime rejects a late preflight acceptance to stop PI prompting.
            }
          };
        }),
    );
    const run = startAgentRun({
      inputs: inputs(),
      prompt: "cancel before acceptance",
      completionResolver: () => "done",
    });
    await vi.waitFor(() => expect(harness.session.prompt).toHaveBeenCalled());
    const stopped = run.stop();
    acceptPreflight();

    await stopped;
    await expect(run.result).resolves.toMatchObject({ kind: "canceled" });
  });

  it("lets cancellation own a later prompt rejection", async () => {
    const harness = createHarness();
    let rejectPreflight!: () => void;
    harness.session.prompt.mockImplementationOnce(
      async (_prompt, options) =>
        new Promise<void>(() => {
          rejectPreflight = () => options?.preflightResult?.(false);
        }),
    );
    const run = startAgentRun({
      inputs: inputs(),
      prompt: "cancel rejected prompt",
      completionResolver: () => "done",
    });
    await vi.waitFor(() => expect(harness.session.prompt).toHaveBeenCalled());
    const stopped = run.stop();
    rejectPreflight();

    await stopped;
    await expect(run.result).resolves.toMatchObject({ kind: "canceled" });
  });

  it("lets cancellation own a later accepted-prompt rejection", async () => {
    const harness = createHarness();
    let rejectPrompt!: (error: Error) => void;
    let finishAbort!: () => void;
    harness.session.prompt.mockImplementationOnce(
      async (_prompt, options) =>
        new Promise<void>((_resolve, reject) => {
          options?.preflightResult?.(true);
          rejectPrompt = reject;
        }),
    );
    harness.session.abort.mockImplementationOnce(
      () =>
        new Promise<undefined>((resolve) => {
          finishAbort = () => resolve(undefined);
        }),
    );
    const run = startAgentRun({
      inputs: inputs(),
      prompt: "cancel accepted prompt",
      completionResolver: () => "done",
    });
    await vi.waitFor(() => expect(harness.session.prompt).toHaveBeenCalled());
    const stopped = run.stop();
    rejectPrompt(new Error("private accepted prompt error"));
    await vi.waitFor(() => expect(finishAbort).toBeTypeOf("function"));
    finishAbort();

    await stopped;
    await expect(run.result).resolves.toMatchObject({ kind: "canceled" });
  });

  it("maps an accepted prompt rejection after settlement to unexpected runner failure", async () => {
    const harness = createHarness();
    let rejectPrompt!: (error: Error) => void;
    harness.session.prompt.mockImplementationOnce(
      async (_prompt, options) =>
        new Promise<void>((_resolve, reject) => {
          options?.preflightResult?.(true);
          rejectPrompt = reject;
        }),
    );
    const run = startAgentRun({
      inputs: inputs(),
      prompt: "reject after acceptance",
      completionResolver: () => "done",
    });
    await vi.waitFor(() => expect(harness.session.prompt).toHaveBeenCalled());
    harness.session.emit({ type: "agent_settled" });
    rejectPrompt(new Error("private provider error"));

    await expect(run.result).resolves.toMatchObject({
      kind: "failed",
      failureCode: "unexpected-runner-failure",
    });
  });

  it("invokes completion resolution once when settlement events repeat", async () => {
    const harness = createHarness();
    let resolveCompletion!: (value: string) => void;
    const completion = new Promise<string>((resolve) => {
      resolveCompletion = resolve;
    });
    const resolver = vi.fn(() => completion);
    const run = startAgentRun({
      inputs: inputs(),
      prompt: "duplicate settlement",
      completionResolver: resolver,
    });
    await vi.waitFor(() => expect(resolver).toHaveBeenCalledTimes(1));
    await expect(run.steer("too late")).resolves.toBe("not-running");
    harness.session.emit({ type: "agent_settled" });
    expect(resolver).toHaveBeenCalledTimes(1);
    resolveCompletion("done");

    await expect(run.result).resolves.toMatchObject({ kind: "success", value: "done" });
  });

  it("does not create or prompt a session when the signal is already aborted", async () => {
    const harness = createHarness();
    const reload = vi.fn(async () => undefined);
    const controller = new AbortController();
    controller.abort();
    const run = startAgentRun({
      inputs: inputs({ reload }),
      prompt: "pre-aborted",
      signal: controller.signal,
      completionResolver: () => "done",
    });

    await expect(run.result).resolves.toMatchObject({ kind: "canceled" });
    expect(reload).not.toHaveBeenCalled();
    expect(harness.session.prompt).not.toHaveBeenCalled();
  });
});
