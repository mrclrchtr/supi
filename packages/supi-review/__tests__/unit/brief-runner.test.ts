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
  },
}));

import { runBriefSynthesis } from "../../src/tool/brief-runner.ts";

const model = {
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

  it("returns success when submit_review_brief is called", async () => {
    mockSession.subscribe.mockImplementation((listener: (event: unknown) => void) => {
      setTimeout(() => listener({ type: "agent_end", messages: [] }), 10);
      return vi.fn();
    });

    const resultPromise = runBriefSynthesis({
      prompt: "synthesize",
      model,
      cwd: "/tmp",
    });

    await vi.advanceTimersByTimeAsync(5);
    const submitTool = capturedCustomTools[0];
    expect(submitTool).toBeDefined();

    await submitTool.execute("toolcall-1", {
      summary: "Refactor auth flow",
      intendedOutcome: "Preserve auth semantics",
      constraints: ["Keep API stable"],
      focusAreas: ["Authentication"],
      riskyFiles: ["src/auth.ts"],
      unresolvedQuestions: [],
    });

    await vi.advanceTimersByTimeAsync(20);
    const result = await resultPromise;

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.brief.summary).toBe("Refactor auth flow");
    }
  });

  it("returns failed when the synthesizer never submits a brief", async () => {
    mockSession.subscribe.mockImplementation((listener: (event: unknown) => void) => {
      setTimeout(() => listener({ type: "agent_end", messages: [] }), 10);
      return vi.fn();
    });
    mockSession.messages = [{ role: "assistant", content: "I forgot to submit the brief." }];

    const resultPromise = runBriefSynthesis({
      prompt: "synthesize",
      model,
      cwd: "/tmp",
    });

    await vi.advanceTimersByTimeAsync(20);
    const result = await resultPromise;

    expect(result.kind).toBe("failed");
    if (result.kind === "failed") {
      expect(result.reason).toContain("did not call submit_review_brief");
    }
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
    expect(mockCreateAgentSession).not.toHaveBeenCalled();
  });

  it("does not misclassify cancellation when agent_end arrives during abort", async () => {
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
    listener?.({ type: "agent_end", messages: [] });

    const result = await resultPromise;
    expect(result.kind).toBe("canceled");
    vi.useFakeTimers();
  });

  it("does not misclassify timeout when agent_end arrives during abort", async () => {
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
    listener?.({ type: "agent_end", messages: [] });

    const result = await resultPromise;
    expect(result.kind).toBe("timeout");
    vi.useFakeTimers();
  });
});
