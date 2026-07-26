import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockSession = {
  prompt: vi.fn(),
  subscribe: vi.fn(),
  abort: vi.fn(),
  dispose: vi.fn(),
  messages: [] as Array<{ role: string; content: string | Array<{ type: string; text: string }> }>,
  getSessionStats: vi.fn(),
};

let capturedCustomTools: Array<{ execute: (...args: unknown[]) => Promise<unknown> }> = [];

const mockCreateAgentSession = vi.hoisted(() => vi.fn());

vi.mock("@earendil-works/pi-coding-agent", () => ({
  createAgentSession: mockCreateAgentSession,
  DefaultResourceLoader: class MockDefaultResourceLoader {
    reload = vi.fn().mockResolvedValue(undefined);
  },
  SessionManager: {
    inMemory: vi.fn().mockReturnValue({}),
  },
  defineTool: vi.fn((tool) => tool),
  AgentSession: vi.fn(),
}));

vi.mock("typebox", () => ({
  Type: {
    Object: vi.fn((schema) => schema),
    Array: vi.fn((schema) => schema),
    String: vi.fn(() => ({})),
    Number: vi.fn(() => ({})),
    Union: vi.fn((options) => ({ type: "union", options })),
    Literal: vi.fn((value) => ({ type: "literal", value })),
    Optional: vi.fn((schema) => ({ optional: schema })),
  },
}));

import { runBriefSynthesis } from "../../src/tool/brief-runner.ts";
import * as reviewSchemas from "../../src/tool/schemas.ts";

const model = {
  provider: "anthropic",
  id: "claude-sonnet-4",
  name: "Claude Sonnet 4",
  reasoning: true,
  thinkingLevelMap: { max: "max" },
  contextWindow: 200_000,
  api: {} as never,
  baseUrl: "",
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  maxTokens: 8_000,
} as unknown as Parameters<typeof runBriefSynthesis>[0]["model"];

function resetMockSession(): void {
  mockSession.prompt.mockReset();
  mockSession.subscribe.mockReset();
  mockSession.abort.mockReset();
  mockSession.dispose.mockReset();
  mockSession.messages = [];
  mockSession.getSessionStats.mockReset();
  mockSession.prompt.mockResolvedValue(undefined);
  mockSession.subscribe.mockReturnValue(vi.fn());
  mockSession.abort.mockResolvedValue(undefined);
}

function setupCreateAgentSession(): void {
  capturedCustomTools = [];
  mockCreateAgentSession.mockImplementation(
    async (opts: {
      customTools?: Array<{ execute: (...args: unknown[]) => Promise<unknown> }>;
    }) => {
      capturedCustomTools = opts.customTools ?? [];
      return { session: mockSession };
    },
  );
}

describe("runBriefSynthesis", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetMockSession();
    setupCreateAgentSession();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("requires reviewInstructionBlockIds in the brief schema and returns them on success", async () => {
    const reviewBriefSchema = (reviewSchemas as Record<string, unknown>).reviewBriefSchema as
      | Record<string, unknown>
      | undefined;

    const reviewInstructionBlockIdsKey = "reviewInstruction" + "BlockIds";

    expect(reviewBriefSchema).toBeDefined();
    expect(reviewBriefSchema).toHaveProperty(reviewInstructionBlockIdsKey);

    mockSession.subscribe.mockImplementation((listener: (event: unknown) => void) => {
      setTimeout(() => listener({ type: "agent_settled" }), 10);
      return vi.fn();
    });

    const resultPromise = runBriefSynthesis({
      prompt: "synthesize",
      model,
      cwd: "/tmp",
    });

    await vi.advanceTimersByTimeAsync(5);
    const callOptions = mockCreateAgentSession.mock.calls[0]?.[0];
    expect(callOptions).toMatchObject({ thinkingLevel: "max" });
    expect(callOptions).not.toHaveProperty("modelRegistry");
    const submitTool = capturedCustomTools[0];
    expect(submitTool).toBeDefined();

    await submitTool.execute("toolcall-1", {
      summary: "Refactor auth flow",
      intendedOutcome: "Preserve auth semantics",
      constraints: ["Keep API stable"],
      focusAreas: ["Authentication"],
      riskyFiles: ["src/auth.ts"],
      unresolvedQuestions: [],
      reviewInstructionBlockIds: ["public-surface"],
    });

    await vi.advanceTimersByTimeAsync(20);
    const result = await resultPromise;

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.brief.summary).toBe("Refactor auth flow");
      expect(
        (result.brief as { reviewInstructionBlockIds?: string[] }).reviewInstructionBlockIds,
      ).toEqual(["public-surface"]);
      expect("diagnostics" in result).toBe(false);
    }
  });

  it("returns a host-owned failure with lifecycle diagnostics when no brief is submitted", async () => {
    mockSession.subscribe.mockImplementation((listener: (event: unknown) => void) => {
      setTimeout(() => listener({ type: "agent_settled" }), 10);
      return vi.fn();
    });
    mockSession.messages = [
      {
        role: "assistant",
        content: "private assistant text that must not enter diagnostics",
      },
    ];

    const resultPromise = runBriefSynthesis({
      prompt: "synthesize",
      model,
      cwd: "/tmp",
    });

    await vi.advanceTimersByTimeAsync(20);
    const result = await resultPromise;

    expect(result.kind).toBe("failed");
    if (result.kind === "failed") {
      expect(result.failureCode).toBe("missing-structured-output");
      expect(result.diagnostics?.lifecycleTrace).toEqual({
        entries: [{ type: "agent_settled" }],
        droppedCount: 0,
      });
      expect(JSON.stringify(result)).not.toContain("private assistant text");
    }
  });

  it("uses the static session-creation failure code without a trace or caught error", async () => {
    mockCreateAgentSession.mockRejectedValue(new Error("private creation error"));

    const result = await runBriefSynthesis({
      prompt: "synthesize",
      model,
      cwd: "/tmp",
    });

    expect(result).toEqual({ kind: "failed", failureCode: "session-creation-failed" });
    expect(JSON.stringify(result)).not.toContain("private creation error");
  });

  it("returns prompt-rejected diagnostics without retaining a rejection error", async () => {
    mockSession.prompt.mockImplementation(async (_prompt, options) => {
      options?.preflightResult?.(false);
    });

    const result = await runBriefSynthesis({
      prompt: "synthesize",
      model,
      cwd: "/tmp",
    });

    expect(result).toMatchObject({
      kind: "failed",
      failureCode: "prompt-rejected",
      diagnostics: {
        lifecycleTrace: {
          entries: [{ type: "prompt_rejected" }],
          droppedCount: 0,
        },
      },
    });
  });

  it("returns canceled immediately when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    const result = await runBriefSynthesis({
      prompt: "synthesize",
      model,
      cwd: "/tmp",
      signal: controller.signal,
    });

    expect(result.kind).toBe("canceled");
    if (result.kind === "canceled") {
      expect(result.diagnostics.lifecycleTrace.entries).toEqual([
        { type: "abort_requested", reason: "canceled" },
      ]);
    }
    expect(mockCreateAgentSession).not.toHaveBeenCalled();
  });

  it("does not misclassify cancellation when agent_settled arrives during abort", async () => {
    vi.useRealTimers();
    const controller = new AbortController();
    let listener: ((event: unknown) => void) | undefined;

    mockSession.subscribe.mockImplementation((sessionListener: (event: unknown) => void) => {
      listener = sessionListener;
      return vi.fn();
    });
    mockSession.abort.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(undefined), 5)),
    );

    const resultPromise = runBriefSynthesis({
      prompt: "synthesize",
      model,
      cwd: "/tmp",
      signal: controller.signal,
    });

    await new Promise((resolve) => setTimeout(resolve, 1));
    controller.abort();
    listener?.({ type: "agent_settled" });

    const result = await resultPromise;
    expect(result.kind).toBe("canceled");
    if (result.kind === "canceled") {
      expect(result.diagnostics.lifecycleTrace.entries).toEqual([
        { type: "abort_requested", reason: "canceled" },
        { type: "agent_settled" },
      ]);
    }
    vi.useFakeTimers();
  });

  it("does not misclassify timeout when agent_settled arrives during abort", async () => {
    vi.useRealTimers();
    let listener: ((event: unknown) => void) | undefined;

    mockSession.subscribe.mockImplementation((sessionListener: (event: unknown) => void) => {
      listener = sessionListener;
      return vi.fn();
    });
    mockSession.abort.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(undefined), 5)),
    );

    const resultPromise = runBriefSynthesis({
      prompt: "synthesize",
      model,
      cwd: "/tmp",
      timeoutMs: 10,
    });

    await new Promise((resolve) => setTimeout(resolve, 12));
    listener?.({ type: "agent_settled" });

    const result = await resultPromise;
    expect(result.kind).toBe("timeout");
    if (result.kind === "timeout") {
      expect(result.diagnostics.lifecycleTrace.entries).toEqual([
        { type: "timeout_expired" },
        { type: "abort_requested", reason: "timeout" },
        { type: "agent_settled" },
      ]);
    }
    vi.useFakeTimers();
  });
});
