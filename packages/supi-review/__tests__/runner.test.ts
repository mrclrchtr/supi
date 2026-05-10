import type { Model } from "@earendil-works/pi-ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReviewOutputEvent, ReviewTarget } from "../src/types.ts";

// Minimal model stub — the reviewer tests don't exercise the actual
// model path (they were passing `undefined` before tightening the type).
// `reasoning: false` causes `clampThinkingLevel` to return "off".
// biome-ignore lint/suspicious/noExplicitAny: Model<any> is pi's canonical type
const mockModel = { reasoning: false } as unknown as Model<any>;

// Mock session object reused across tests
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

// Import after mocks are set up
import { runReviewer } from "../src/runner.ts";

function resetMockSession(): void {
  mockSession.prompt.mockReset();
  mockSession.subscribe.mockReset();
  mockSession.steer.mockReset();
  mockSession.abort.mockReset();
  mockSession.dispose.mockReset();
  mockSession.messages = [];
  mockSession.getSessionStats.mockReset();

  // Default: prompt resolves immediately
  mockSession.prompt.mockResolvedValue(undefined);
  // Default: subscribe returns unsubscribe fn
  mockSession.subscribe.mockReturnValue(vi.fn());
  // Default: steer resolves
  mockSession.steer.mockResolvedValue(undefined);
  // Default: abort resolves
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

const defaultTarget: ReviewTarget = { type: "custom", instructions: "test review" };

function defaultReviewOutput(): ReviewOutputEvent {
  return {
    findings: [],
    overall_correctness: "patch is correct",
    overall_explanation: "Looks good",
    overall_confidence_score: 0.8,
  };
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
      model: mockModel,
      cwd: "/tmp",
      signal: controller.signal,
      target: defaultTarget,
    });

    expect(result.kind).toBe("canceled");
    expect(mockCreateAgentSession).not.toHaveBeenCalled();
  });

  it("creates session with correct tools and options", async () => {
    let listener: ((event: unknown) => void) | undefined;
    mockSession.subscribe.mockImplementation((l: (event: unknown) => void) => {
      listener = l;
      return vi.fn();
    });

    const resultPromise = runReviewer({
      prompt: "review this",
      model: mockModel,
      cwd: "/tmp",
      target: defaultTarget,
    });

    // Wait for session creation, then fire agent_end synchronously
    await vi.advanceTimersByTimeAsync(1);
    listener?.({ type: "agent_end", messages: [] });
    await vi.advanceTimersByTimeAsync(10);
    await resultPromise;

    expect(mockCreateAgentSession).toHaveBeenCalledTimes(1);
    const callOpts = mockCreateAgentSession.mock.calls[0]?.[0];
    expect(callOpts.tools).toContain("submit_review");
    expect(callOpts.tools).toContain("read");
    expect(callOpts.tools).toContain("grep");
    expect(callOpts.sessionManager).toBeDefined();
    expect(callOpts.resourceLoader).toBeDefined();
  });

  it("returns success when submit_review tool was called", async () => {
    mockSession.subscribe.mockImplementation((listener: (event: unknown) => void) => {
      // Emit agent_end after a short delay (not synchronously, so the tool
      // gets a chance to be registered first)
      setTimeout(() => {
        listener({ type: "agent_end", messages: [] });
      }, 10);
      return vi.fn();
    });

    const resultPromise = runReviewer({
      prompt: "review this",
      model: mockModel,
      cwd: "/tmp",
      target: defaultTarget,
    });

    // Wait for session creation + tool registration
    await vi.advanceTimersByTimeAsync(5);

    // Manually trigger the submit_review tool's execute to simulate the
    // tool being called by the reviewer agent. This populates the closure
    // variable that runReviewer reads on agent_end.
    const submitReviewTool = capturedCustomTools[0];
    expect(submitReviewTool).toBeDefined();

    const reviewOutput = defaultReviewOutput();
    await submitReviewTool.execute("toolcall-1", reviewOutput);

    // Now let agent_end fire
    await vi.advanceTimersByTimeAsync(50);
    const result = await resultPromise;

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.output).toEqual(reviewOutput);
      expect(result.target).toEqual(defaultTarget);
    }
  });

  it("returns failed when reviewer does not call submit_review", async () => {
    mockSession.subscribe.mockImplementation((listener: (event: unknown) => void) => {
      setTimeout(() => {
        listener({ type: "agent_end", messages: [] });
      }, 10);
      return vi.fn();
    });

    // No messages means no assistant text to fall back to
    mockSession.messages = [];

    const resultPromise = runReviewer({
      prompt: "review this",
      model: mockModel,
      cwd: "/tmp",
      target: defaultTarget,
    });

    await vi.advanceTimersByTimeAsync(50);
    const result = await resultPromise;

    expect(result.kind).toBe("failed");
    if (result.kind === "failed") {
      expect(result.reason).toContain("did not produce");
    }
    expect(mockSession.dispose).toHaveBeenCalled();
  });

  it("returns failed when session creation fails", async () => {
    mockCreateAgentSession.mockRejectedValue(new Error("Model not available"));

    const result = await runReviewer({
      prompt: "review this",
      model: mockModel,
      cwd: "/tmp",
      target: defaultTarget,
    });

    expect(result.kind).toBe("failed");
    if (result.kind === "failed") {
      expect(result.reason).toContain("Failed to create reviewer session");
    }
  });

  it("handles abort signal", async () => {
    vi.useRealTimers();
    const controller = new AbortController();

    mockSession.subscribe.mockReturnValue(vi.fn());
    mockSession.abort.mockResolvedValue(undefined);

    const resultPromise = runReviewer({
      prompt: "review this",
      model: mockModel,
      cwd: "/tmp",
      signal: controller.signal,
      target: defaultTarget,
    });

    // Wait for session creation to finish before aborting
    await vi.dynamicImportSettled?.();
    await new Promise((resolve) => setTimeout(resolve, 5));

    // Abort the signal
    controller.abort();

    const result = await resultPromise;
    expect(result.kind).toBe("canceled");
    vi.useFakeTimers();
  });

  it("detects aborted signal that fired during session creation", async () => {
    vi.useRealTimers();
    const controller = new AbortController();

    mockSession.subscribe.mockReturnValue(vi.fn());
    mockSession.abort.mockResolvedValue(undefined);

    // Simulate abort firing during session creation
    mockCreateAgentSession.mockImplementation(async () => {
      controller.abort();
      return { session: mockSession };
    });

    const result = await runReviewer({
      prompt: "review this",
      model: mockModel,
      cwd: "/tmp",
      signal: controller.signal,
      target: defaultTarget,
    });

    // The abort fired during session creation, so the post-registration
    // check should catch it and return canceled.
    expect(result.kind).toBe("canceled");
    vi.useFakeTimers();
  });

  it("calls onProgress callbacks with tool activity", async () => {
    const onProgress = vi.fn();
    const onToolActivity = vi.fn();

    mockSession.subscribe.mockImplementation((listener: (event: unknown) => void) => {
      setTimeout(() => {
        listener({
          type: "tool_execution_start",
          toolCallId: "1",
          toolName: "read",
          args: {},
        });
        listener({
          type: "tool_execution_end",
          toolCallId: "1",
          toolName: "read",
          result: {},
          isError: false,
        });
        listener({
          type: "turn_end",
          message: { role: "assistant", content: "done" },
        });
        listener({ type: "agent_end", messages: [] });
      }, 10);
      return vi.fn();
    });

    const resultPromise = runReviewer({
      prompt: "review this",
      model: mockModel,
      cwd: "/tmp",
      target: defaultTarget,
      onProgress,
      onToolActivity,
    });

    await vi.advanceTimersByTimeAsync(50);
    await resultPromise;

    expect(onToolActivity).toHaveBeenCalledWith({ toolName: "read", phase: "start" });
    expect(onToolActivity).toHaveBeenCalledWith({ toolName: "read", phase: "end" });
    expect(onProgress).toHaveBeenCalled();
  });

  it("steers on timeout then aborts after grace turns", async () => {
    vi.useRealTimers();

    let sessionListener: ((event: unknown) => void) | undefined;
    mockSession.subscribe.mockImplementation((listener: (event: unknown) => void) => {
      sessionListener = listener;
      return vi.fn();
    });

    mockSession.steer.mockResolvedValue(undefined);
    mockSession.abort.mockResolvedValue(undefined);
    mockSession.getSessionStats.mockReturnValue({
      tokens: { input: 100, output: 50, total: 150 },
    });

    const resultPromise = runReviewer({
      prompt: "review this",
      model: mockModel,
      cwd: "/tmp",
      target: defaultTarget,
      timeoutMs: 100, // Very short timeout for testing
    });

    // Wait for timeout to trigger, then simulate grace turns
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(mockSession.steer).toHaveBeenCalledWith(expect.stringContaining("Time limit reached"));

    // Simulate 3 grace turns expiring
    if (sessionListener) {
      sessionListener({
        type: "turn_end",
        message: { role: "assistant", content: "continuing" },
      });
      sessionListener({
        type: "turn_end",
        message: { role: "assistant", content: "still going" },
      });
      sessionListener({
        type: "turn_end",
        message: { role: "assistant", content: "one more" },
      });
    }

    const result = await resultPromise;
    expect(result.kind).toBe("timeout");
    if (result.kind === "timeout") {
      expect(result.timeoutMs).toBe(100);
    }

    vi.useFakeTimers();
  });

  it("does not abort on grace turns when already settled", async () => {
    vi.useRealTimers();

    let sessionListener: ((event: unknown) => void) | undefined;
    mockSession.subscribe.mockImplementation((listener: (event: unknown) => void) => {
      sessionListener = listener;
      return vi.fn();
    });

    mockSession.steer.mockResolvedValue(undefined);
    mockSession.abort.mockResolvedValue(undefined);

    const resultPromise = runReviewer({
      prompt: "review this",
      model: mockModel,
      cwd: "/tmp",
      target: defaultTarget,
      timeoutMs: 100,
    });

    await new Promise((resolve) => setTimeout(resolve, 150));

    // agent_end (settled) fires BEFORE grace turns run out
    if (sessionListener) {
      sessionListener({ type: "agent_end", messages: [] });
    }

    const result = await resultPromise;
    expect(result.kind).toBe("failed"); // No submit_review called
    // abort() should NOT have been called since the session already ended
    expect(mockSession.abort).not.toHaveBeenCalled();

    vi.useFakeTimers();
  });

  it("returns session error when prompt fails", async () => {
    mockSession.subscribe.mockReturnValue(vi.fn());
    mockSession.prompt.mockRejectedValue(new Error("API error: rate limit"));

    const result = await runReviewer({
      prompt: "review this",
      model: mockModel,
      cwd: "/tmp",
      target: defaultTarget,
    });

    expect(result.kind).toBe("failed");
    if (result.kind === "failed") {
      expect(result.reason).toContain("Reviewer session error");
    }
  });

  it("falls back to last assistant text when submit_review not called", async () => {
    mockSession.subscribe.mockImplementation((listener: (event: unknown) => void) => {
      setTimeout(() => {
        listener({ type: "agent_end", messages: [] });
      }, 10);
      return vi.fn();
    });

    mockSession.messages = [
      {
        role: "assistant",
        content: "I reviewed the code but forgot to call submit_review",
      },
    ];

    const resultPromise = runReviewer({
      prompt: "review this",
      model: mockModel,
      cwd: "/tmp",
      target: defaultTarget,
    });

    await vi.advanceTimersByTimeAsync(50);
    const result = await resultPromise;

    expect(result.kind).toBe("failed");
    if (result.kind === "failed") {
      expect(result.reason).toContain("did not call submit_review");
    }
  });
});
