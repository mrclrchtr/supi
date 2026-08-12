import { type Mock, vi } from "vitest";
import type { AgentRunProviderAuthority, AgentSessionInputs } from "../../src/api.ts";

export interface AgentRunMocks {
  createAgentSession: Mock;
  createAgentSessionRuntime: Mock;
}

export function createHarness(mocks: AgentRunMocks, entries: unknown[] = []) {
  const listeners = new Set<(event: { type: string; [key: string]: unknown }) => void>();
  let extensionActive = true;
  const extensionRuntime = {
    sendMessage: vi.fn(),
    sendUserMessage: vi.fn(),
    assertActive: vi.fn(() => {
      if (!extensionActive) throw new Error("Agent Run extension activity is closed");
    }),
    invalidate: vi.fn((_message?: string) => {
      extensionActive = false;
    }),
  };
  const extensionRunner = {
    invalidate: vi.fn((message?: string) => {
      extensionActive = false;
      extensionRuntime.invalidate(message);
    }),
  };
  const session = {
    modelRuntime: {},
    agent: { waitForIdle: vi.fn(async () => undefined) },
    extensionRunner,
    model: {},
    thinkingLevel: "low",
    isStreaming: false,
    isIdle: true,
    messages: [{ role: "assistant", content: [{ type: "text", text: "done" }] }] as unknown[],
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
    setActiveToolsByName: vi.fn(),
    setModel: vi.fn(async () => undefined),
    setThinkingLevel: vi.fn(),
    steer: vi.fn(async () => undefined),
    sendUserMessage: vi.fn(
      async (_content?: unknown, _options?: unknown): Promise<void> => undefined,
    ),
    sendCustomMessage: vi.fn(
      async (_message?: unknown, _options?: unknown): Promise<void> => undefined,
    ),
    clearQueue: vi.fn(() => ({ steering: [], followUp: [] })),
    get pendingMessageCount() {
      return 0;
    },
    waitForIdle: vi.fn(async () => undefined),
    abort: vi.fn(async () => undefined),
    dispose: vi.fn(() => extensionRunner.invalidate()),
    getActiveToolNames: vi.fn(() => ["read"]),
    getSessionStats: vi.fn(() => ({ tokens: { input: 0, output: 0, total: 0 } })),
    getLastAssistantText: vi.fn(() => "done"),
  };
  const runtime = {
    session,
    dispose: vi.fn(async () => {
      session.dispose();
    }),
  };
  mocks.createAgentSession.mockResolvedValue({
    session,
    extensionsResult: { runtime: extensionRuntime },
  });
  mocks.createAgentSessionRuntime.mockImplementation(async (factory) => {
    await factory({ cwd: "/repo", agentDir: "/agent", sessionManager: {} });
    return runtime;
  });
  return { session, runtime, extensionRuntime };
}

const defaultModel = {
  provider: "test-provider",
  id: "test-model",
  name: "Test Model",
  api: "openai-completions" as const,
  baseUrl: "https://test.example",
  reasoning: false,
  input: ["text"] as ("text" | "image")[],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 10_000,
  maxTokens: 1_000,
};

const defaultProvider = {
  id: defaultModel.provider,
  name: "Test Provider",
  auth: {
    apiKey: {
      name: "Test key",
      resolve: async () => ({ auth: { apiKey: "test-key" } }),
    },
  },
  getModels: () => [defaultModel],
  stream: vi.fn(),
  streamSimple: vi.fn(),
};

const defaultProviderAuthority: AgentRunProviderAuthority = {
  getProvider: () => defaultProvider,
  getProviderAuth: async () => ({ auth: { apiKey: "test-key" } }),
};

export function inputs(
  resourceLoader: Record<string, unknown> = { reload: vi.fn(async () => undefined) },
  options: {
    model?: typeof defaultModel;
    providerAuthority?: AgentRunProviderAuthority;
  } = {},
) {
  return {
    cwd: "/repo",
    model: (options.model ?? defaultModel) as never,
    providerAuthority: options.providerAuthority ?? defaultProviderAuthority,
    thinkingLevel: "low" as const,
    tools: ["read"],
    customTools: [],
    resourceLoader: resourceLoader as unknown as AgentSessionInputs["resourceLoader"],
    settingsManager: {} as AgentSessionInputs["settingsManager"],
  };
}
