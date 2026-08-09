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

it("starts timeout measurement only immediately before prompting", async () => {
  vi.useFakeTimers();
  const ready = deferred<boolean | undefined>();
  const harness = createHarness(mocks);
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

it("clears queued messages and rejects extension sends at the cancellation fence", async () => {
  const harness = createHarness(mocks);
  harness.session.prompt.mockImplementationOnce(async (_prompt, options) => {
    harness.session.isStreaming = true;
    options?.preflightResult?.(true);
    harness.session.emit({ type: "queue_update", steering: ["queued"], followUp: ["later"] });
    await new Promise<undefined>(() => {});
  });
  const run = startAgentRun({
    inputs: inputs(),
    prompt: "fenced",
    completionResolver: () => "done",
  });
  await vi.waitFor(() => expect(harness.session.prompt).toHaveBeenCalled());

  const stopped = run.stop();
  expect(harness.session.clearQueue).toHaveBeenCalledTimes(1);
  expect(() => harness.extensionRuntime.sendUserMessage("late")).toThrow(/closed|stale|active/i);

  await stopped;
  expect(() => harness.extensionRuntime.assertActive()).toThrow(/closed|stale|active/i);
  await expect(run.result).resolves.toMatchObject({ kind: "canceled" });
});

it("allows active steering, makes stop idempotent, and settles after disposal", async () => {
  const harness = createHarness(mocks);
  let finishPrompt!: () => void;
  harness.session.prompt.mockImplementationOnce(
    async (_prompt, options) =>
      new Promise<void>((resolve) => {
        harness.session.isStreaming = true;
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

it("memoizes reentrant stop calls before publishing stopping", async () => {
  const harness = createHarness(mocks);
  harness.session.prompt.mockImplementationOnce(
    async (_prompt, options) =>
      new Promise<void>(() => {
        options?.preflightResult?.(true);
      }),
  );
  const run = startAgentRun({
    inputs: inputs(),
    prompt: "reentrant stop",
    completionResolver: () => "done",
  });
  await vi.waitFor(() => expect(harness.session.prompt).toHaveBeenCalled());
  let nestedStop: Promise<void> | undefined;
  run.subscribe((progress) => {
    if (progress.status === "stopping" && !nestedStop) nestedStop = run.stop();
  });
  const firstStop = run.stop();

  expect(nestedStop).toBe(firstStop);
  await firstStop;
  await expect(run.result).resolves.toMatchObject({ kind: "canceled" });
  expect(harness.session.abort).toHaveBeenCalledTimes(1);
});

it("waits for prompt preflight to settle before disposing after stop", async () => {
  const harness = createHarness(mocks);
  let finishPreflight!: (accepted: boolean) => void;
  harness.session.prompt.mockImplementationOnce(
    async (_prompt, options) =>
      new Promise<void>(() => {
        finishPreflight = (accepted) => options?.preflightResult?.(accepted);
      }),
  );
  const run = startAgentRun({
    inputs: inputs(),
    prompt: "wait preflight",
    completionResolver: () => "done",
  });
  await vi.waitFor(() => expect(harness.session.prompt).toHaveBeenCalled());
  const stopped = run.stop();
  let stoppedEarly = false;
  void stopped.then(() => {
    stoppedEarly = true;
  });
  await Promise.resolve();
  expect(stoppedEarly).toBe(false);
  finishPreflight(false);

  await stopped;
  await expect(run.result).resolves.toMatchObject({ kind: "canceled" });
});

it("lets cancellation win a timeout race and records one abort request", async () => {
  vi.useFakeTimers();
  const harness = createHarness(mocks);
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
  await vi.advanceTimersToNextTimerAsync();

  const outcome = await run.result;
  expect(outcome.kind).toBe("canceled");
  if (outcome.kind !== "canceled") return;
  expect(outcome.diagnostics.lifecycleTrace.entries).toEqual([
    { type: "abort_requested", reason: "canceled" },
  ]);
});

it("forces session disposal when graceful runtime shutdown exceeds its grace", async () => {
  vi.useFakeTimers();
  const harness = createHarness(mocks);
  harness.runtime.dispose.mockImplementationOnce(() => new Promise<undefined>(() => {}));
  const run = startAgentRun({
    inputs: inputs(),
    prompt: "forced disposal",
    completionResolver: () => "done",
  });
  await vi.waitFor(() => expect(harness.runtime.dispose).toHaveBeenCalledTimes(1));
  await vi.advanceTimersToNextTimerAsync();

  await expect(run.result).resolves.toMatchObject({ kind: "success", value: "done" });
  expect(harness.session.dispose).toHaveBeenCalledTimes(1);
});

it("settles cancellation after abort grace when the provider never resolves", async () => {
  vi.useFakeTimers();
  const harness = createHarness(mocks);
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
  await vi.advanceTimersToNextTimerAsync();
  await stopped;
  await expect(run.result).resolves.toMatchObject({ kind: "canceled" });
  expect(harness.session.abort).toHaveBeenCalledTimes(1);
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
