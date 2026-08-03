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
import { AGENT_RUN_ABORT_GRACE_MS, startAgentRun } from "../../src/api.ts";

const usage = (value: number) => ({
  input: value,
  output: value + 1,
  cacheRead: value + 2,
  cacheWrite: value + 3,
  totalTokens: value * 4,
  reasoning: value,
  cost: {
    input: value,
    output: value,
    cacheRead: value,
    cacheWrite: value,
    total: value * 4,
  },
});

function createHarness(entries: unknown[] = []) {
  const listeners = new Set<(event: { type: string; [key: string]: unknown }) => void>();
  const session = {
    modelRuntime: {},
    agent: { streamFunction: vi.fn() },
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
        options?.preflightResult?.(true);
        session.emit({ type: "agent_settled" });
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

  it("starts timeout measurement only immediately before prompting", async () => {
    vi.useFakeTimers();
    const ready = deferred<boolean | undefined>();
    const harness = createHarness();
    harness.session.prompt.mockImplementationOnce(
      async (_prompt, options) =>
        new Promise<void>(() => {
          options?.preflightResult?.(true);
        }),
    );
    const run = startAgentRun({
      inputs: inputs(),
      prompt: "timed",
      timeoutMs: 10,
      readinessCheck: () => ready.promise,
      completionResolver: () => "done",
    });
    await vi.runAllTicks();
    expect(harness.session.prompt).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(harness.session.prompt).not.toHaveBeenCalled();
    ready.resolve(true);
    await vi.runAllTicks();
    await vi.advanceTimersByTimeAsync(10);

    const outcome = await run.result;
    expect(outcome).toMatchObject({ kind: "timeout", timeoutMs: 10 });
    if (outcome.kind !== "timeout") return;
    expect(outcome.diagnostics.lifecycleTrace.entries).toEqual([
      { type: "timeout_expired" },
      { type: "abort_requested", reason: "timeout" },
    ]);
    expect(harness.session.abort).toHaveBeenCalledTimes(1);
  });

  it("allows active steering, makes stop idempotent, and settles after disposal", async () => {
    const harness = createHarness();
    let finishPrompt!: () => void;
    harness.session.prompt.mockImplementationOnce(
      async (_prompt, options) =>
        new Promise<void>((resolve) => {
          options?.preflightResult?.(true);
          finishPrompt = resolve;
        }),
    );
    const run = startAgentRun({
      inputs: inputs(),
      prompt: "long",
      completionResolver: () => "done",
    });
    await vi.waitFor(() => expect(harness.session.prompt).toHaveBeenCalled());
    await expect(run.steer("redirect")).resolves.toBe("accepted");
    const firstStop = run.stop();
    const secondStop = run.stop();
    finishPrompt();
    await Promise.all([firstStop, secondStop]);
    await expect(run.result).resolves.toMatchObject({ kind: "canceled" });
    await expect(run.steer("late")).resolves.toBe("not-running");
    expect(harness.session.abort).toHaveBeenCalledTimes(1);
    expect(harness.runtime.dispose).toHaveBeenCalledTimes(1);
  });

  it("lets cancellation win a timeout race and records one abort request", async () => {
    vi.useFakeTimers();
    const harness = createHarness();
    const controller = new AbortController();
    harness.session.prompt.mockImplementationOnce(
      async (_prompt, options) =>
        new Promise<undefined>(() => {
          options?.preflightResult?.(true);
        }),
    );
    harness.session.abort.mockImplementationOnce(() => new Promise<undefined>(() => {}));
    const run = startAgentRun({
      inputs: inputs(),
      prompt: "race",
      signal: controller.signal,
      timeoutMs: 10,
      completionResolver: () => "done",
    });
    await flushMicrotasks();
    expect(harness.session.prompt).toHaveBeenCalled();
    controller.abort();
    await vi.advanceTimersByTimeAsync(10);
    expect(harness.session.abort).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(AGENT_RUN_ABORT_GRACE_MS);

    const outcome = await run.result;
    expect(outcome.kind).toBe("canceled");
    if (outcome.kind !== "canceled") return;
    expect(outcome.diagnostics.lifecycleTrace.entries).toEqual([
      { type: "abort_requested", reason: "canceled" },
    ]);
  });

  it("settles cancellation after abort grace when the provider never resolves", async () => {
    vi.useFakeTimers();
    const harness = createHarness();
    harness.session.prompt.mockImplementationOnce(
      async (_prompt, options) =>
        new Promise<undefined>(() => {
          options?.preflightResult?.(true);
        }),
    );
    const run = startAgentRun({
      inputs: inputs(),
      prompt: "hung abort",
      completionResolver: () => "done",
    });
    await flushMicrotasks();
    expect(harness.session.prompt).toHaveBeenCalled();
    harness.session.abort.mockImplementationOnce(() => new Promise<undefined>(() => {}));
    const stopped = run.stop();
    await vi.advanceTimersByTimeAsync(AGENT_RUN_ABORT_GRACE_MS);
    await stopped;
    await expect(run.result).resolves.toMatchObject({ kind: "canceled" });
    expect(harness.session.abort).toHaveBeenCalledTimes(1);
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
    await Promise.resolve();
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
    const controller = new AbortController();
    controller.abort();
    const run = startAgentRun({
      inputs: inputs(),
      prompt: "pre-aborted",
      signal: controller.signal,
      completionResolver: () => "done",
    });

    await expect(run.result).resolves.toMatchObject({ kind: "canceled" });
    expect(harness.session.prompt).not.toHaveBeenCalled();
  });

  it("includes usage from an observed model response before persistence", async () => {
    const harness = createHarness();
    const observed = usage(7);
    harness.session.agent.streamFunction.mockResolvedValueOnce({
      result: vi.fn(async () => ({ usage: observed })),
    });
    harness.session.prompt.mockImplementationOnce(async (_prompt, options) => {
      options?.preflightResult?.(true);
      const stream = await harness.session.agent.streamFunction({}, {}, undefined);
      await stream.result();
      harness.session.emit({ type: "agent_settled" });
    });
    const run = startAgentRun({
      inputs: inputs(),
      prompt: "observed usage",
      completionResolver: () => "done",
    });

    const outcome = await run.result;
    expect(outcome.kind).toBe("success");
    expect(outcome.usage?.input).toBe(7);
  });

  it("refreshes usage after disposal work adds a billed entry", async () => {
    const entries = [{ type: "message", message: { role: "assistant", usage: usage(1) } }];
    const harness = createHarness(entries);
    harness.runtime.dispose.mockImplementationOnce(async () => {
      entries.push({ type: "message", message: { role: "assistant", usage: usage(2) } });
    });
    const run = startAgentRun({
      inputs: inputs(),
      prompt: "late usage",
      completionResolver: () => "done",
    });

    const outcome = await run.result;
    expect(outcome.kind).toBe("success");
    expect(outcome.usage?.input).toBe(3);
  });

  it("aggregates assistant, tool-result, compaction, and branch-summary usage", async () => {
    createHarness([
      { type: "message", message: { role: "assistant", usage: usage(1) } },
      { type: "message", message: { role: "toolResult", usage: usage(2) } },
      { type: "compaction", usage: usage(3) },
      { type: "branch_summary", usage: usage(4) },
    ]);
    const progress = vi.fn();
    const run = startAgentRun({
      inputs: inputs(),
      prompt: "usage",
      completionResolver: () => "done",
    });
    run.subscribe(progress);
    const outcome = await run.result;

    expect(outcome.kind).toBe("success");
    if (outcome.kind !== "success") return;
    expect(outcome.usage).toMatchObject({
      input: 10,
      output: 14,
      cacheRead: 18,
      cacheWrite: 22,
      totalTokens: 40,
      reasoning: 10,
    });
    expect(progress.mock.calls.some(([snapshot]) => snapshot.usage?.input === 10)).toBe(true);
  });
});

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 8; index++) await Promise.resolve();
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}
