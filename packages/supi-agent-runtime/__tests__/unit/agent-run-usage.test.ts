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
