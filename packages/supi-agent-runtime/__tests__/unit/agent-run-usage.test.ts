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

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.useRealTimers());

it("refreshes usage after disposal work adds a billed entry", async () => {
  const entries = [{ type: "message", message: { role: "assistant", usage: usage(1) } }];
  const harness = createHarness(mocks, entries);
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

it("omits usage when session messages are unavailable", async () => {
  const harness = createHarness(mocks);
  Object.defineProperty(harness.session, "messages", {
    get() {
      throw new Error("private transcript error");
    },
  });
  const run = startAgentRun({
    inputs: inputs(),
    prompt: "unavailable usage",
    completionResolver: () => "done",
  });

  await expect(run.result).resolves.toMatchObject({ kind: "success", value: "done" });
  expect((await run.result).usage).toBeUndefined();
});

it("counts persisted and live messages once by identity", async () => {
  const persisted = { role: "assistant", usage: usage(1) };
  const liveOnly = { role: "assistant", usage: usage(2) };
  const harness = createHarness(mocks, [{ type: "message", message: persisted }]);
  harness.session.messages = [persisted, liveOnly];
  const run = startAgentRun({
    inputs: inputs(),
    prompt: "deduplicated usage",
    completionResolver: () => "done",
  });

  await expect(run.result).resolves.toMatchObject({
    kind: "success",
    usage: { input: 3 },
  });
});

it("aggregates assistant, tool-result, compaction, and branch-summary usage", async () => {
  createHarness(mocks, [
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
