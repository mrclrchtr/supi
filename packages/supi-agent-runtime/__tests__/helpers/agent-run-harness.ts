import { type Mock, vi } from "vitest";
import type { AgentSessionInputs } from "../../src/api.ts";

export interface AgentRunMocks {
  createAgentSession: Mock;
  createAgentSessionRuntime: Mock;
}

export function createHarness(mocks: AgentRunMocks, entries: unknown[] = []) {
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

export function inputs(
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
