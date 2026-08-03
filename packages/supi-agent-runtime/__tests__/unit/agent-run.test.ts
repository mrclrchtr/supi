import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAgentSession: vi.fn(),
  createAgentSessionRuntime: vi.fn(),
}));

vi.mock("@earendil-works/pi-coding-agent", async (original) => ({
  ...(await original()),
  createAgentSession: mocks.createAgentSession,
  createAgentSessionRuntime: mocks.createAgentSessionRuntime,
}));

import { startAgentRun } from "../../src/api.ts";

function createSession() {
  let listener: ((event: { type: string }) => void) | undefined;
  const session = {
    bindExtensions: vi.fn(async () => undefined),
    subscribe: vi.fn((callback: (event: { type: string }) => void) => {
      listener = callback;
      return vi.fn();
    }),
    prompt: vi.fn(async () => {
      listener?.({ type: "agent_settled" });
    }),
    abort: vi.fn(async () => undefined),
    steer: vi.fn(async () => undefined),
    getActiveToolNames: vi.fn(() => ["read"]),
    getSessionStats: vi.fn(() => ({ tokens: { input: 1, output: 2, total: 3 } })),
    messages: [{ role: "assistant", content: [{ type: "text", text: "done" }] }],
    dispose: vi.fn(),
  };
  return session;
}

describe("startAgentRun", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a handle, resolves caller completion, and exposes active steering", async () => {
    const session = createSession();
    const runtime = { session, dispose: vi.fn(async () => undefined) };
    mocks.createAgentSession.mockResolvedValue({ session });
    mocks.createAgentSessionRuntime.mockImplementation(async (factory) => {
      await factory({ cwd: "/repo", agentDir: "/agent", sessionManager: {} });
      return runtime;
    });
    const observer = vi.fn();
    const progress = vi.fn();

    const run = startAgentRun({
      inputs: {
        cwd: "/repo",
        model: {} as never,
        thinkingLevel: "low",
        tools: ["read"],
        customTools: [],
        resourceLoader: { reload: vi.fn(async () => undefined) } as never,
        settingsManager: {} as never,
      },
      prompt: "work",
      readinessCheck: (view) => view.getActiveToolNames().includes("read"),
      completionResolver: (view) => (view.messages.length > 0 ? "complete" : undefined),
      observer,
    });

    const unsubscribe = run.subscribe(progress);
    await expect(run.result).resolves.toMatchObject({ kind: "success", value: "complete" });
    expect(await run.steer("redirect")).toBe("not-running");
    expect(observer).toHaveBeenCalledTimes(1);
    expect(progress.mock.calls[0]?.[0].status).toBe("starting");
    unsubscribe();
  });
});
