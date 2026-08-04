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

  it("rejects an unready session without prompting and tears down the observer", async () => {
    const { session, runtime } = createHarness();
    const teardown = vi.fn();
    let viewKeys: string[] = [];
    const run = startAgentRun({
      inputs: inputs(),
      prompt: "work",
      readinessCheck: () => false,
      observer: (view) => {
        viewKeys = Object.keys(view);
        expect(Object.isFrozen(view)).toBe(true);
        expect(Object.isFrozen(view.model)).toBe(true);
        expect(Object.isFrozen(view.messages)).toBe(true);
        expect(Object.isFrozen(view.messages[0])).toBe(true);
        expect(Object.isFrozen(view.messages[0]?.content)).toBe(true);
        return teardown;
      },
      completionResolver: () => "done",
    });

    await expect(run.result).resolves.toMatchObject({
      kind: "failed",
      failureCode: "session-not-ready",
    });
    expect(session.prompt).not.toHaveBeenCalled();
    expect(runtime.dispose).toHaveBeenCalledTimes(1);
    expect(teardown).toHaveBeenCalledTimes(1);
    expect(viewKeys).not.toContain("session");
    expect(viewKeys).not.toContain("abort");
    expect(viewKeys).not.toContain("dispose");
  });

  it("snapshots callback events instead of forwarding session-owned objects", async () => {
    const _harness = createHarness();
    let observedEvent: object | undefined;
    const run = startAgentRun({
      inputs: inputs(),
      prompt: "event snapshot",
      observer: (view) => {
        view.subscribe((event) => {
          observedEvent = event;
        });
      },
      completionResolver: () => "done",
    });

    await expect(run.result).resolves.toMatchObject({ kind: "success", value: "done" });
    expect(Object.isFrozen(observedEvent)).toBe(true);
  });

  it("classifies observer setup errors as an unready session", async () => {
    const harness = createHarness();
    const run = startAgentRun({
      inputs: inputs(),
      prompt: "observer error",
      observer: () => {
        throw new Error("private observer error");
      },
      completionResolver: () => "done",
    });

    await expect(run.result).resolves.toMatchObject({
      kind: "failed",
      failureCode: "session-not-ready",
    });
    expect(harness.session.prompt).not.toHaveBeenCalled();
  });

  it("cancels instead of reporting observer setup failure", async () => {
    const harness = createHarness();
    let rejectObserver!: (error: Error) => void;
    const run = startAgentRun({
      inputs: inputs(),
      prompt: "cancel observer",
      observer: async () =>
        new Promise<undefined>((_resolve, reject) => {
          rejectObserver = reject;
        }),
      completionResolver: () => "done",
    });
    await vi.waitFor(() => expect(rejectObserver).toBeTypeOf("function"));
    const stopped = run.stop();
    rejectObserver(new Error("observer failed after cancellation"));

    await stopped;
    await expect(run.result).resolves.toMatchObject({ kind: "canceled" });
    expect(harness.session.prompt).not.toHaveBeenCalled();
  });

  it("cancels instead of reporting readiness failure", async () => {
    const harness = createHarness();
    let rejectReadiness!: (error: Error) => void;
    const run = startAgentRun({
      inputs: inputs(),
      prompt: "cancel readiness",
      readinessCheck: async () =>
        new Promise<boolean>((_resolve, reject) => {
          rejectReadiness = reject;
        }),
      completionResolver: () => "done",
    });
    await vi.waitFor(() => expect(rejectReadiness).toBeTypeOf("function"));
    const stopped = run.stop();
    rejectReadiness(new Error("readiness failed after cancellation"));

    await stopped;
    await expect(run.result).resolves.toMatchObject({ kind: "canceled" });
    expect(harness.session.prompt).not.toHaveBeenCalled();
  });

  it("settles handled prompts even when no agent_settled event is emitted", async () => {
    const harness = createHarness();
    harness.session.prompt.mockImplementationOnce(async (_prompt, options) => {
      options?.preflightResult?.(true);
    });
    const run = startAgentRun({
      inputs: inputs(),
      prompt: "/handled-command",
      completionResolver: () => "done",
    });

    await expect(run.result).resolves.toMatchObject({ kind: "success", value: "done" });
    await expect(run.steer("too late")).resolves.toBe("not-running");
    expect(harness.runtime.dispose).toHaveBeenCalledTimes(1);
  });

  it("does not steer during the running transition before prompting starts", async () => {
    const harness = createHarness();
    let earlySteer: Promise<"accepted" | "not-running"> | undefined;
    const run = startAgentRun({
      inputs: inputs(),
      prompt: "early steer",
      completionResolver: () => "done",
    });
    run.subscribe((progress) => {
      if (progress.status === "running" && !earlySteer) earlySteer = run.steer("too early");
    });

    await expect(run.result).resolves.toMatchObject({ kind: "success", value: "done" });
    await expect(earlySteer).resolves.toBe("not-running");
    expect(harness.session.steer).not.toHaveBeenCalled();
  });

  it("distinguishes prompt rejection and missing completion", async () => {
    const first = createHarness();
    first.session.prompt.mockImplementationOnce(async (_prompt, options) => {
      options?.preflightResult?.(false);
    });
    const rejected = startAgentRun({
      inputs: inputs(),
      prompt: "reject",
      completionResolver: () => "done",
    });
    const rejectedOutcome = await rejected.result;
    expect(rejectedOutcome).toMatchObject({
      kind: "failed",
      failureCode: "prompt-rejected",
    });
    expect(JSON.stringify(rejectedOutcome)).not.toContain("private");

    vi.clearAllMocks();
    const second = createHarness();
    const missing = startAgentRun({
      inputs: inputs(),
      prompt: "missing",
      completionResolver: () => undefined,
    });
    await expect(missing.result).resolves.toMatchObject({
      kind: "failed",
      failureCode: "missing-completion",
    });
    expect(second.session.prompt).toHaveBeenCalledTimes(1);
  });

  it("waits through uncancelable setup, suppresses the prompt, and disposes late setup", async () => {
    let releaseRuntime!: () => void;
    const runtimeReady = new Promise<void>((resolve) => {
      releaseRuntime = resolve;
    });
    const harness = createHarness();
    mocks.createAgentSessionRuntime.mockImplementationOnce(async (factory) => {
      await factory({ cwd: "/repo", agentDir: "/agent", sessionManager: {} });
      await runtimeReady;
      return harness.runtime;
    });
    const controller = new AbortController();
    const run = startAgentRun({
      inputs: inputs(),
      prompt: "must not prompt",
      signal: controller.signal,
      completionResolver: () => "done",
    });
    await vi.waitFor(() => expect(mocks.createAgentSessionRuntime).toHaveBeenCalled());
    const stopped = run.stop();
    expect(harness.session.prompt).not.toHaveBeenCalled();
    releaseRuntime();

    await stopped;
    expect(harness.runtime.dispose).toHaveBeenCalledTimes(1);
    await expect(run.result).resolves.toMatchObject({ kind: "canceled" });
    expect(harness.session.prompt).not.toHaveBeenCalled();
  });
});
