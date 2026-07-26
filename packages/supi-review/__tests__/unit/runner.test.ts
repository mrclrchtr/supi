import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockSession = {
  prompt: vi.fn(),
  subscribe: vi.fn(),
  steer: vi.fn(),
  abort: vi.fn(),
  dispose: vi.fn(),
  messages: [] as Array<Record<string, unknown>>,
  getSessionStats: vi.fn(),
};

let capturedCustomTools: Array<{ execute: (...args: unknown[]) => Promise<unknown> }> = [];

const mockCreateAgentSession = vi.hoisted(() => vi.fn());
const mockResourceLoaderInit = vi.hoisted(() => vi.fn());

vi.mock("@earendil-works/pi-coding-agent", () => ({
  createAgentSession: mockCreateAgentSession,
  DefaultResourceLoader: class MockDefaultResourceLoader {
    constructor(options: unknown) {
      mockResourceLoaderInit(options);
    }

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
    Number: vi.fn((options) => options ?? {}),
    Union: vi.fn((options) => ({ type: "union", options })),
    Literal: vi.fn((value) => ({ type: "literal", value })),
    Optional: vi.fn((schema) => ({ optional: schema })),
  },
}));

import { runReviewer } from "../../src/tool/review-runner.ts";
import { buildReviewerSystemPrompt } from "../../src/tool/review-system-prompt.ts";
import * as reviewSchemas from "../../src/tool/schemas.ts";

const snapshot = {
  target: { kind: "working-tree" as const },
  title: "Working tree changes",
  changedFiles: ["src/auth.ts"],
  diffText: "diff --git a/src/auth.ts b/src/auth.ts",
  stats: { files: 1, additions: 1, deletions: 0 },
};

const brief = {
  summary: "Refactor auth flow",
  intendedOutcome: "Preserve auth semantics",
  constraints: ["Keep public API stable"],
  focusAreas: ["Authentication"],
  riskyFiles: ["src/auth.ts"],
  unresolvedQuestions: [],
  reviewInstructionBlockIds: [],
};

const model = {
  canonicalId: "anthropic/claude-sonnet-4",
  provider: "anthropic",
  id: "claude-sonnet-4",
  label: "Claude Sonnet 4",
  description: "anthropic/claude-sonnet-4",
  isCurrent: true,
  model: {
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
  },
} as unknown as Parameters<typeof runReviewer>[0]["model"];

function resetMockSession(): void {
  mockSession.prompt.mockReset();
  mockSession.subscribe.mockReset();
  mockSession.steer.mockReset();
  mockSession.abort.mockReset();
  mockSession.dispose.mockReset();
  mockSession.messages = [];
  mockSession.getSessionStats.mockReset();
  mockSession.prompt.mockResolvedValue(undefined);
  mockSession.subscribe.mockReturnValue(vi.fn());
  mockSession.steer.mockResolvedValue(undefined);
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

describe("runReviewer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetMockSession();
    setupCreateAgentSession();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("defines structured review items with fix guidance and no legacy priority field", () => {
    const reviewItemSchema = (reviewSchemas as Record<string, unknown>).reviewItemSchema as
      | Record<string, unknown>
      | undefined;
    const reviewOutputSchema = reviewSchemas.reviewOutputSchema as unknown as Record<
      string,
      unknown
    >;

    expect(reviewItemSchema).toBeDefined();
    expect(reviewOutputSchema).toHaveProperty("items");
    expect(reviewOutputSchema).not.toHaveProperty("findings");
    expect(reviewItemSchema).toHaveProperty("category");
    expect(reviewItemSchema).toHaveProperty("impact");
    expect(reviewItemSchema).toHaveProperty("effort");
    expect(reviewItemSchema).toHaveProperty("recommended_action");
    expect(reviewItemSchema).toHaveProperty("suggested_fix");
    expect(reviewItemSchema).toHaveProperty("verification_hint");
    expect(reviewItemSchema).toHaveProperty("confidence_score");
    expect(reviewItemSchema?.confidence_score).toMatchObject({ minimum: 0, maximum: 1 });
    expect(reviewItemSchema).not.toHaveProperty("priority");
  });

  it("tells the reviewer to treat packet mandatory review instructions as required checks", () => {
    const prompt = buildReviewerSystemPrompt();

    expect(prompt).toContain("mandatory review instructions");
    expect(prompt).not.toContain("audit hints");
    expect(prompt).toContain("mandatory");
  });

  it("returns canceled immediately when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    const result = await runReviewer({
      prompt: "review this",
      model,
      cwd: "/tmp",
      signal: controller.signal,
      snapshot,
      brief,
    });

    expect(result.kind).toBe("canceled");
    if (result.kind === "canceled") {
      expect(result.diagnostics.lifecycleTrace.entries).toEqual([
        { type: "abort_requested", reason: "canceled" },
      ]);
    }
    expect(mockCreateAgentSession).not.toHaveBeenCalled();
  });

  it("uses the static session-creation failure code without a trace or caught error", async () => {
    mockCreateAgentSession.mockRejectedValue(new Error("private creation error"));

    const result = await runReviewer({
      prompt: "review this",
      model,
      cwd: "/tmp",
      snapshot,
      brief,
    });

    expect(result).toMatchObject({
      kind: "failed",
      failureCode: "session-creation-failed",
    });
    expect("diagnostics" in result).toBe(false);
    expect(JSON.stringify(result)).not.toContain("private creation error");
  });

  it("returns prompt-rejected diagnostics without retaining a rejection error", async () => {
    mockSession.prompt.mockImplementation(async (_prompt, options) => {
      options?.preflightResult?.(false);
    });

    const result = await runReviewer({
      prompt: "review this",
      model,
      cwd: "/tmp",
      snapshot,
      brief,
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

  it("creates the reviewer session with read-only tools and snapshot tools", async () => {
    let listener: ((event: unknown) => void) | undefined;
    mockSession.subscribe.mockImplementation((fn: (event: unknown) => void) => {
      listener = fn;
      return vi.fn();
    });

    const resultPromise = runReviewer({
      prompt: "review this",
      model,
      cwd: "/tmp",
      snapshot,
      brief,
    });

    await vi.advanceTimersByTimeAsync(1);
    listener?.({ type: "agent_settled" });
    await vi.advanceTimersByTimeAsync(5);
    await resultPromise;

    const callOpts = mockCreateAgentSession.mock.calls[0]?.[0];
    expect(callOpts).toMatchObject({ thinkingLevel: "max" });
    expect(callOpts).not.toHaveProperty("modelRegistry");
    expect(mockResourceLoaderInit).toHaveBeenCalledWith(
      expect.objectContaining({ noExtensions: true, noContextFiles: false }),
    );
    expect(callOpts.tools).toEqual([
      "read",
      "grep",
      "find",
      "ls",
      "submit_review",
      "read_snapshot_diff",
      "read_snapshot_file",
    ]);
    const customToolNames = callOpts.customTools?.map((t: { name: string }) => t.name) ?? [];
    expect(customToolNames).toContain("read_snapshot_diff");
    expect(customToolNames).toContain("read_snapshot_file");
    expect(customToolNames).toContain("submit_review");
  });

  it("returns success when submit_review is called with structured review items", async () => {
    mockSession.subscribe.mockImplementation((listener: (event: unknown) => void) => {
      setTimeout(() => listener({ type: "agent_settled" }), 10);
      return vi.fn();
    });

    const resultPromise = runReviewer({
      prompt: "review this",
      model,
      cwd: "/tmp",
      snapshot,
      brief,
    });

    await vi.advanceTimersByTimeAsync(5);
    const submitTool = capturedCustomTools[0];
    expect(submitTool).toBeDefined();

    await submitTool.execute("toolcall-1", {
      items: [
        {
          title: "Missing guard",
          body: "Null token path is not checked.",
          category: "correctness",
          impact: "high",
          effort: "low",
          recommended_action: "must-fix",
          confidence_score: 0.92,
          suggested_fix: "Add an early null guard before using the token.",
          verification_hint: "Run the auth-path tests and confirm null input fails cleanly.",
        },
      ],
      overall_explanation: "One must-fix item remains.",
      overall_confidence_score: 0.8,
    });

    await vi.advanceTimersByTimeAsync(20);
    const result = await resultPromise;

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.snapshot).toEqual(snapshot);
      expect(result.brief?.summary).toBe("Refactor auth flow");
      expect(result.modelId).toBe(model.canonicalId);
      expect((result.output as unknown as Record<string, unknown>).items).toBeDefined();
      expect((result.output as unknown as Record<string, unknown>).findings).toBeUndefined();
      expect("diagnostics" in result).toBe(false);
    }
  });

  it("survives overflow compaction between agent_end and agent_settled", async () => {
    let listener: ((event: unknown) => void) | undefined;
    mockSession.subscribe.mockImplementation((fn: (event: unknown) => void) => {
      listener = fn;
      return vi.fn();
    });

    const resultPromise = runReviewer({
      prompt: "review this",
      model,
      cwd: "/tmp",
      snapshot,
      brief,
    });

    await vi.advanceTimersByTimeAsync(1);
    const overflowMessage = {
      role: "assistant",
      content: [],
      stopReason: "error",
      errorMessage:
        "Codex error: Your input exceeds the context window of this model. Please adjust your input and try again.",
    };
    mockSession.messages = [overflowMessage];
    listener?.({ type: "message_end", message: overflowMessage });
    listener?.({ type: "agent_end", messages: [overflowMessage] });
    expect(mockSession.dispose).not.toHaveBeenCalled();
    listener?.({ type: "compaction_start", reason: "overflow" });
    listener?.({ type: "compaction_end", reason: "overflow", willRetry: true });

    const submitTool = capturedCustomTools[0];
    expect(submitTool).toBeDefined();
    await submitTool.execute("toolcall-after-compaction", {
      items: [],
      overall_explanation: "No issues found after compaction.",
      overall_confidence_score: 0.85,
    });
    listener?.({ type: "agent_settled" });

    const result = await resultPromise;
    expect(result.kind).toBe("success");
  });

  it("retains overflow recovery and retry transitions in their observed order on failure", async () => {
    let listener: ((event: unknown) => void) | undefined;
    mockSession.subscribe.mockImplementation((callback: (event: unknown) => void) => {
      listener = callback;
      return vi.fn();
    });

    const resultPromise = runReviewer({
      prompt: "review this",
      model,
      cwd: "/tmp",
      snapshot,
      brief,
    });

    await vi.advanceTimersByTimeAsync(1);
    listener?.({ type: "agent_start" });
    listener?.({ type: "agent_end", messages: [], willRetry: true });
    listener?.({ type: "compaction_start", reason: "overflow" });
    listener?.({
      type: "compaction_end",
      reason: "overflow",
      aborted: false,
      willRetry: true,
      result: undefined,
      errorMessage: "private compaction error",
    });
    listener?.({
      type: "auto_retry_start",
      attempt: 2,
      maxAttempts: 3,
      delayMs: 50,
      errorMessage: "private retry error",
    });
    listener?.({
      type: "auto_retry_end",
      success: false,
      attempt: 2,
      finalError: "private final retry error",
    });
    listener?.({ type: "agent_settled" });

    const result = await resultPromise;

    expect(result.kind).toBe("failed");
    if (result.kind !== "failed") return;
    expect(result.diagnostics?.lifecycleTrace).toEqual({
      entries: [
        { type: "agent_start" },
        { type: "agent_end", willRetry: true },
        { type: "compaction_start", reason: "overflow" },
        {
          type: "compaction_end",
          reason: "overflow",
          aborted: false,
          willRetry: true,
          hasResult: false,
          hasError: true,
        },
        { type: "auto_retry_start", attempt: 2, maxAttempts: 3, delayMs: 50 },
        { type: "auto_retry_end", success: false, attempt: 2, hasFinalError: true },
        { type: "agent_settled" },
      ],
      droppedCount: 0,
    });
    expect(JSON.stringify(result)).not.toContain("private compaction error");
    expect(JSON.stringify(result)).not.toContain("private retry error");
  });

  it("attaches safe lifecycle diagnostics when the reviewer never submits a result", async () => {
    mockSession.getSessionStats.mockReturnValue({
      tokens: { input: 120, output: 45, total: 165 },
    });
    mockSession.subscribe.mockImplementation((listener: (event: unknown) => void) => {
      setTimeout(() => {
        listener({
          type: "message_end",
          message: {
            role: "assistant",
            content: "private assistant text that must not enter diagnostics",
            stopReason: "stop",
            errorMessage: "private assistant error",
          },
        });
        listener({ type: "agent_end", messages: [], willRetry: false });
        listener({ type: "agent_settled" });
      }, 10);
      return vi.fn();
    });
    mockSession.messages = [
      {
        role: "assistant",
        content: "private assistant text that must not enter diagnostics",
        stopReason: "stop",
        errorMessage: "private assistant error",
      },
    ];

    const resultPromise = runReviewer({
      prompt: "review this",
      model,
      cwd: "/tmp",
      snapshot,
      brief,
    });

    await vi.advanceTimersByTimeAsync(20);
    const result = await resultPromise;

    expect(result.kind).toBe("failed");
    if (result.kind === "failed") {
      expect(result.failureCode).toBe("missing-structured-output");
      expect(result.diagnostics).toMatchObject({
        turns: 0,
        toolUses: 0,
        tokens: { input: 120, output: 45, total: 165 },
        recentActivity: ["assistant:end:stop"],
        lifecycleTrace: {
          entries: [
            { type: "steer_requested", reason: "submit" },
            { type: "agent_end", willRetry: false },
            { type: "agent_settled" },
          ],
          droppedCount: 0,
        },
        lastAssistantStopReason: "stop",
      });
      expect(JSON.stringify(result)).not.toContain("private assistant text");
      expect(JSON.stringify(result)).not.toContain("private assistant error");
    }
  });

  it("records timeout steering and hard abort markers when soft timeout steering fails", async () => {
    mockSession.steer.mockRejectedValue(new Error("private steer error"));

    const resultPromise = runReviewer({
      prompt: "review this",
      model,
      cwd: "/tmp",
      snapshot,
      brief,
      timeoutMs: 10,
    });

    await vi.advanceTimersByTimeAsync(10);
    const result = await resultPromise;

    expect(result.kind).toBe("timeout");
    if (result.kind !== "timeout") return;
    expect(result.diagnostics.lifecycleTrace.entries).toEqual([
      { type: "timeout_expired" },
      { type: "steer_requested", reason: "timeout" },
      { type: "abort_requested", reason: "timeout" },
    ]);
    expect(JSON.stringify(result)).not.toContain("private steer error");
  });

  it("handles abort signals after session creation", async () => {
    vi.useRealTimers();
    const controller = new AbortController();

    const resultPromise = runReviewer({
      prompt: "review this",
      model,
      cwd: "/tmp",
      signal: controller.signal,
      snapshot,
      brief,
    });

    await new Promise((resolve) => setTimeout(resolve, 5));
    controller.abort();

    const result = await resultPromise;
    expect(result.kind).toBe("canceled");
    if (result.kind === "canceled") {
      expect(result.diagnostics.lifecycleTrace.entries).toEqual([
        { type: "abort_requested", reason: "canceled" },
      ]);
    }
    vi.useFakeTimers();
  });
});
