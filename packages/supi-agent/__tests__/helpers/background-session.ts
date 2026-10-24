import type { Usage } from "@earendil-works/pi-ai";
import {
  type AgentSession,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { vi } from "vitest";

/** A controlled Pi SDK session, without dependencies on private SuPi test helpers. */
export function controlledSession(
  tools: string[],
  defaultUsage: Usage,
  manager: SessionManager = SessionManager.inMemory(process.cwd()),
  settingsManager = SettingsManager.inMemory(),
) {
  const listeners = new Set<(event: { type: string; [key: string]: unknown }) => void>();
  let active = true;
  let releasePrompt: (() => void) | undefined;
  let rejectPrompt: ((error: Error) => void) | undefined;
  let disposal: Promise<void> | undefined;
  const extensionRuntime = {
    sendMessage: vi.fn(),
    sendUserMessage: vi.fn(),
    assertActive: () => {
      if (!active) throw new Error("The SDK session is closed.");
    },
    invalidate: () => {
      active = false;
    },
  };
  const session = {
    modelRuntime: {},
    settingsManager,
    model: {},
    thinkingLevel: "off",
    systemPrompt: "",
    isStreaming: false,
    get isIdle() {
      return !session.isStreaming;
    },
    agent: { waitForIdle: vi.fn(async () => undefined), state: {} },
    extensionRunner: { invalidate: () => extensionRuntime.invalidate() },
    messages: [] as unknown[],
    sessionManager: manager,
    bindExtensions: vi.fn(async () => undefined),
    subscribe: (listener: (event: { type: string; [key: string]: unknown }) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    prompt: vi.fn<AgentSession["prompt"]>(async (prompt, options) => {
      manager.appendMessage({ role: "user", content: prompt, timestamp: Date.now() });
      session.isStreaming = true;
      options?.preflightResult?.("started");
      try {
        await new Promise<void>((resolve, reject) => {
          releasePrompt = resolve;
          rejectPrompt = reject;
        });
      } finally {
        session.isStreaming = false;
        for (const listener of listeners) listener({ type: "agent_settled" });
      }
    }),
    setActiveToolsByName: vi.fn(),
    setModel: vi.fn(),
    setThinkingLevel: vi.fn(),
    steer: vi.fn(async () => "queued"),
    sendUserMessage: vi.fn(async () => undefined),
    sendCustomMessage: vi.fn(async () => undefined),
    clearQueue: vi.fn(() => ({ steering: [], followUp: [] })),
    pendingMessageCount: 0,
    waitForIdle: vi.fn(async () => undefined),
    abort: vi.fn(async () => {
      releasePrompt?.();
      session.isStreaming = false;
    }),
    dispose: vi.fn(() => extensionRuntime.invalidate()),
    getActiveToolNames: () => tools,
    getAllTools: () => [],
    getToolDefinition: () => undefined,
    getSessionStats: () => ({
      tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      cost: 0,
    }),
    getLastAssistantText: vi.fn(() => "Child result"),
  };
  const runtime = {
    session,
    dispose: vi.fn(async () => {
      await disposal;
      session.dispose();
    }),
  };
  const bill = (text = "", usage = defaultUsage) => {
    const id = manager.appendMessage({
      role: "assistant",
      content: [{ type: "text", text }],
      api: "openai-completions",
      provider: "test",
      model: "model",
      usage,
      stopReason: "stop",
      timestamp: Date.now(),
    });
    session.messages = manager.buildSessionContext().messages;
    return id;
  };
  return {
    session,
    runtime,
    extensionRuntime,
    bill,
    finish(text = "Child result", usage = defaultUsage) {
      bill(text, usage);
      session.getLastAssistantText.mockReturnValue(text);
      releasePrompt?.();
    },
    fail() {
      bill();
      rejectPrompt?.(new Error("Controlled SDK failure"));
    },
    failProvider(errorMessage: string) {
      session.messages.push({ role: "assistant", content: [], stopReason: "error", errorMessage });
      releasePrompt?.();
    },
    holdDisposal() {
      let release: () => void = () => undefined;
      disposal = new Promise<void>((resolve) => {
        release = resolve;
      });
      return () => release();
    },
  };
}
