import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockSession = {
  prompt: vi.fn(),
  subscribe: vi.fn(),
  steer: vi.fn(),
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
  },
}));

import { buildReviewerSystemPrompt, runReviewer } from "../../src/tool/review-runner.ts";

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
    reasoning: false,
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
    expect(mockCreateAgentSession).not.toHaveBeenCalled();
  });

  it("creates the reviewer session with read-only tools", async () => {
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
    listener?.({ type: "agent_end", messages: [] });
    await vi.advanceTimersByTimeAsync(5);
    await resultPromise;

    const callOpts = mockCreateAgentSession.mock.calls[0]?.[0];
    expect(callOpts.tools).toEqual(["read", "grep", "find", "ls", "submit_review"]);
  });

  it("returns success when submit_review is called", async () => {
    mockSession.subscribe.mockImplementation((listener: (event: unknown) => void) => {
      setTimeout(() => listener({ type: "agent_end", messages: [] }), 10);
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
      findings: [],
      overall_correctness: "patch is correct",
      overall_explanation: "Looks good",
      overall_confidence_score: 0.8,
    });

    await vi.advanceTimersByTimeAsync(20);
    const result = await resultPromise;

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.snapshot).toEqual(snapshot);
      expect(result.brief?.summary).toBe("Refactor auth flow");
      expect(result.modelId).toBe(model.canonicalId);
    }
  });

  it("returns failed when the reviewer never submits a result", async () => {
    mockSession.subscribe.mockImplementation((listener: (event: unknown) => void) => {
      setTimeout(() => listener({ type: "agent_end", messages: [] }), 10);
      return vi.fn();
    });
    mockSession.messages = [{ role: "assistant", content: "I forgot to submit the review." }];

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
      expect(result.reason).toContain("did not call submit_review");
    }
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
    vi.useFakeTimers();
  });

  // biome-ignore lint/security/noSecrets: high-entropy string is a test label, not a secret
  describe("buildReviewerSystemPrompt", () => {
    it("contains calibration examples for priority and confidence", () => {
      const prompt = buildReviewerSystemPrompt();
      expect(prompt).toContain("Finding calibration");
      expect(prompt).toContain("Priority:");
      expect(prompt).toContain("Confidence:");
    });

    it("contains skip-list guardrail for generated files", () => {
      const prompt = buildReviewerSystemPrompt();
      expect(prompt).toContain("Skip reviewing");
      expect(prompt).toContain("lockfiles");
      expect(prompt).toContain("generated");
    });
  });
});
