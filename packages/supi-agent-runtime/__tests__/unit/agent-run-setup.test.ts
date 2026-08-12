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

import { startAgentRun } from "../../src/api.ts";
import { createHarness, inputs } from "../helpers/agent-run-harness.ts";

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.useRealTimers());

it("rejects an unready session without prompting and tears down the observer", async () => {
  const { session, runtime } = createHarness(mocks);
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
  const _harness = createHarness(mocks);
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
  const harness = createHarness(mocks);
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
  const harness = createHarness(mocks);
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
  const harness = createHarness(mocks);
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

it("waits for a continuation started by a handled prompt", async () => {
  const harness = createHarness(mocks);
  let releaseContinuation!: () => void;
  const continuation = new Promise<void>((resolve) => {
    releaseContinuation = resolve;
  });
  harness.session.prompt.mockImplementationOnce(async (_prompt, options) => {
    options?.preflightResult?.(true);
    void harness.extensionRuntime.sendUserMessage("continuation");
  });
  harness.session.sendUserMessage.mockImplementationOnce(async () => continuation);
  const run = startAgentRun({
    inputs: inputs(),
    prompt: "/handled-command",
    completionResolver: () => "done",
  });

  await vi.waitFor(() =>
    expect(harness.session.sendUserMessage).toHaveBeenCalledWith("continuation", undefined),
  );
  let settled = false;
  void run.result.then(() => {
    settled = true;
  });
  await Promise.resolve();
  expect(settled).toBe(false);

  releaseContinuation();
  await expect(run.result).resolves.toMatchObject({ kind: "success", value: "done" });
  expect(harness.runtime.dispose).toHaveBeenCalledTimes(1);
});

it("settles handled prompts even when no agent_settled event is emitted", async () => {
  const harness = createHarness(mocks);
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
  const harness = createHarness(mocks);
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
  const first = createHarness(mocks);
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
  const second = createHarness(mocks);
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

it("calls a late observer cleanup after cancellation and never prompts", async () => {
  const harness = createHarness(mocks);
  let releaseObserver!: (cleanup: () => void) => void;
  const observerReady = new Promise<() => void>((resolve) => {
    releaseObserver = resolve;
  });
  const cleanup = vi.fn();
  const run = startAgentRun({
    inputs: inputs(),
    prompt: "must not prompt",
    observer: async () => observerReady,
    completionResolver: () => "done",
  });

  await vi.waitFor(() => expect(harness.session.bindExtensions).toHaveBeenCalled());
  const stopped = run.stop();
  releaseObserver(cleanup);

  await stopped;
  await expect(run.result).resolves.toMatchObject({ kind: "canceled" });
  expect(cleanup).toHaveBeenCalledTimes(1);
  expect(harness.session.prompt).not.toHaveBeenCalled();
});

it("waits through uncancelable setup, suppresses the prompt, and disposes late setup", async () => {
  let releaseRuntime!: () => void;
  const runtimeReady = new Promise<void>((resolve) => {
    releaseRuntime = resolve;
  });
  const harness = createHarness(mocks);
  const physicalDispose = harness.session.dispose;
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
  expect(physicalDispose).toHaveBeenCalledTimes(1);
  await expect(run.result).resolves.toMatchObject({ kind: "canceled" });
  expect(harness.session.prompt).not.toHaveBeenCalled();
});
