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

import { SessionManager, SettingsManager } from "@earendil-works/pi-coding-agent";
import { AgentRunRegistry, startAgentRun, startRegisteredAgentRun } from "../../src/api.ts";
import { createHarness, inputs } from "../helpers/agent-run-harness.ts";

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.useRealTimers());

const usage = (tokens: number) => ({
  input: tokens,
  output: tokens,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: tokens * 2,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
});

it("publishes the task result while its same-session retrospective is still running", async () => {
  const harness = createHarness(mocks);
  let releaseRetrospective!: () => void;
  const retrospectiveWork = new Promise<void>((resolve) => {
    releaseRetrospective = resolve;
  });
  harness.session.prompt.mockImplementationOnce(async (_prompt, options) => {
    options?.preflightResult?.("started");
  });
  harness.session.prompt.mockImplementationOnce(async (_prompt, options) => {
    options?.preflightResult?.("started");
    await retrospectiveWork;
    harness.session.messages.push({ role: "assistant", content: [{ type: "text", text: "done" }] });
  });
  const onResult = vi.fn();
  const run = startAgentRun({
    inputs: inputs(),
    prompt: "Complete the task",
    completionResolver: (session) => session.getLastAssistantText(),
    retrospective: { prompt: "Assess the completed task", onResult },
  });
  let finished = false;
  void run.result.then(() => {
    finished = true;
  });

  await expect(run.taskResult).resolves.toMatchObject({ kind: "success", value: "done" });
  await vi.waitFor(() => expect(harness.session.prompt).toHaveBeenCalledTimes(2));
  expect(finished).toBe(false);
  expect(harness.runtime.dispose).not.toHaveBeenCalled();
  expect(onResult).not.toHaveBeenCalled();
  expect(run.steeringAvailable).toBe(false);

  releaseRetrospective();
  await expect(run.result).resolves.toMatchObject({ kind: "success", value: "done" });
  expect(onResult).toHaveBeenCalledWith(
    expect.objectContaining({ status: "completed", text: "done" }),
  );
  expect(harness.runtime.dispose).toHaveBeenCalledOnce();
});

it("freezes task context and Usage before the assessment and bills each phase separately", async () => {
  const harness = createHarness(mocks);
  const manager = SessionManager.inMemory("/repo");
  harness.session.sessionManager = manager as never;
  let promptNumber = 0;
  harness.session.prompt.mockImplementation(async (_prompt, options) => {
    options?.preflightResult?.("started");
    promptNumber++;
    manager.appendMessage({
      role: "assistant",
      content: [{ type: "text", text: promptNumber === 1 ? "task answer" : "observed friction" }],
      api: "openai-completions",
      provider: "test-provider",
      model: "test-model",
      stopReason: "stop",
      timestamp: promptNumber,
      usage: usage(promptNumber === 1 ? 10 : 3),
    });
    harness.session.messages = manager.buildSessionContext().messages;
  });
  harness.session.getLastAssistantText.mockImplementation(() =>
    promptNumber === 1 ? "task answer" : "observed friction",
  );
  const onResult = vi.fn();
  const run = startAgentRun({
    inputs: inputs(),
    prompt: "Task",
    captureContext: true,
    completionResolver: (session) => session.getLastAssistantText(),
    retrospective: { prompt: "Assess", onResult },
  });
  const task = await run.taskResult;
  const final = await run.result;

  expect(task).toMatchObject({ kind: "success", value: "task answer", usage: { totalTokens: 20 } });
  expect(task.context?.entries).toHaveLength(1);
  expect(final.context).toEqual(task.context);
  expect(final.usage?.totalTokens).toBe(26);
  expect(onResult).toHaveBeenCalledWith({
    status: "completed",
    text: "observed friction",
    usage: usage(3),
  });
});

it("restricts the assessment to one tool-free request without changing caller settings", async () => {
  const harness = createHarness(mocks);
  const settings = SettingsManager.inMemory({
    retry: { enabled: true, provider: { maxRetries: 4 } },
  });
  const original = settings.getSettings();
  let checked = false;
  harness.session.prompt.mockImplementationOnce(async (_prompt, options) => {
    options?.preflightResult?.("started");
  });
  harness.session.prompt.mockImplementationOnce(async (_prompt, options) => {
    options?.preflightResult?.("started");
    expect(harness.session.settingsManager.getRetryEnabled()).toBe(false);
    expect(harness.session.settingsManager.getProviderRetrySettings().maxRetries).toBe(0);
    expect(harness.session.settingsManager.getCompactionEnabled()).toBe(false);
    expect(await harness.session.agent.beforeToolCall?.({} as never)).toMatchObject({
      block: true,
      terminate: true,
    });
    await harness.session.agent.streamFunction({} as never, {} as never);
    await expect(
      Promise.resolve().then(() => harness.session.agent.streamFunction({} as never, {} as never)),
    ).rejects.toThrow();
    checked = true;
  });
  const completionResolver = vi.fn(() => "task answer");
  const run = startAgentRun({
    inputs: { ...inputs(), settingsManager: settings },
    prompt: "Task",
    completionResolver,
    retrospective: { prompt: "Assess", onResult: vi.fn() },
  });
  await run.result;

  expect(checked).toBe(true);
  expect(settings.getSettings()).toEqual(original);
  expect(harness.session.setActiveToolsByName).toHaveBeenCalledWith([]);
  expect(completionResolver).toHaveBeenCalledOnce();
});

it("keeps a published task stoppable in the registry during its retrospective", async () => {
  const harness = createHarness(mocks);
  const registry = new AgentRunRegistry();
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  harness.session.prompt.mockImplementationOnce(async (_prompt, options) => {
    options?.preflightResult?.("started");
  });
  harness.session.prompt.mockImplementationOnce(async (_prompt, options) => {
    options?.preflightResult?.("started");
    await pending;
  });
  harness.session.abort.mockImplementation(async () => {
    release();
  });
  const run = startRegisteredAgentRun({
    inputs: inputs(),
    prompt: "Task",
    completionResolver: () => "task answer",
    registry,
    registration: {
      metadata: {
        taskId: "test",
        kind: "Agent Run",
        label: "test",
        cwd: "/repo",
        modelId: "test/model",
        thinkingLevel: "low",
        tools: ["read"],
        startedAt: 1,
      },
    },
    retrospective: { prompt: "Assess", onResult: vi.fn() },
  });
  try {
    await run.taskResult;
    await vi.waitFor(() => expect(registry.snapshot().runs[0]?.status).toBe("retrospecting"));
    expect(registry.hasActive()).toBe(true);
    await expect(registry.stop(run.runKey)).resolves.toBe("accepted");
    await expect(run.result).resolves.toMatchObject({ kind: "success", value: "task answer" });
    await expect(run.taskResult).resolves.toMatchObject({ kind: "success", value: "task answer" });
    expect(harness.runtime.dispose).toHaveBeenCalledOnce();
  } finally {
    release();
    await registry.clear();
  }
});

it("clears the task deadline at readiness without imposing a retrospective deadline", async () => {
  vi.useFakeTimers();
  const harness = createHarness(mocks);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  harness.session.prompt.mockImplementationOnce(async (_prompt, options) => {
    options?.preflightResult?.("started");
  });
  harness.session.prompt.mockImplementationOnce(async (_prompt, options) => {
    options?.preflightResult?.("started");
    await pending;
  });
  const run = startAgentRun({
    inputs: inputs(),
    prompt: "Task",
    timeoutMs: 100,
    completionResolver: () => "answer",
    retrospective: { prompt: "Assess", onResult: vi.fn() },
  });
  await run.taskResult;
  await vi.advanceTimersByTimeAsync(101);
  expect(harness.runtime.dispose).not.toHaveBeenCalled();
  expect(harness.session.abort).not.toHaveBeenCalled();
  release();
  await expect(run.result).resolves.toMatchObject({ kind: "success", value: "answer" });
});

it.each(["disabled", "missing-completion", "provider-error"])(
  "does not assess a %s task",
  async (condition) => {
    const harness = createHarness(mocks);
    if (condition === "provider-error")
      harness.session.messages = [{ role: "assistant", stopReason: "error" }];
    const onResult = vi.fn();
    const run = startAgentRun({
      inputs: inputs(),
      prompt: "Task",
      completionResolver: () => (condition === "missing-completion" ? undefined : "answer"),
      retrospective: { prompt: "Assess", isEnabled: () => condition !== "disabled", onResult },
    });
    await run.taskResult;
    await run.result;
    expect(harness.session.prompt).toHaveBeenCalledOnce();
    expect(onResult).not.toHaveBeenCalled();
  },
);

it("never logs the old task answer as the assessment after a provider failure", async () => {
  const harness = createHarness(mocks);
  harness.session.prompt.mockImplementationOnce(async (_prompt, options) => {
    options?.preflightResult?.("started");
  });
  harness.session.prompt.mockImplementationOnce(async (_prompt, options) => {
    options?.preflightResult?.("started");
    harness.session.messages.push({ role: "assistant", stopReason: "error", content: [] });
  });
  const onResult = vi.fn();
  const run = startAgentRun({
    inputs: inputs(),
    prompt: "Task",
    completionResolver: () => "answer",
    retrospective: { prompt: "Assess", onResult },
  });
  await expect(run.result).resolves.toMatchObject({ kind: "success", value: "answer" });
  expect(onResult).toHaveBeenCalledWith({ status: "failed" });
  expect(harness.session.prompt).toHaveBeenCalledTimes(2);
});
