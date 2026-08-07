import type {
  AgentSessionEvent,
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type {
  AgentRunHandle,
  AgentRunMessage,
  AgentRunSessionView,
  StartAgentRunOptions,
} from "@mrclrchtr/supi-agent-runtime/api";
import {
  createPiMock,
  getHandlerOrThrow,
  getTool,
  makeCtx,
  type ToolDef,
} from "@mrclrchtr/supi-test-utils";
import { vi } from "vitest";

export type Renderable = { render: (width: number) => string[] };

export type RegisteredAgentRunTool = ToolDef & {
  renderCall: (...args: unknown[]) => Renderable;
  renderResult: (...args: unknown[]) => Renderable;
};

export const theme = {
  fg: (color: string, text: string) => `[${color}]${text}[/${color}]`,
  bold: (text: string) => `*${text}*`,
};

export interface RunDoubleConfig {
  value?: string;
  messages?: readonly AgentRunMessage[];
  events?: readonly AgentSessionEvent[];
}

export type Shutdown = () => Promise<unknown>;

export function render(component: Renderable): string {
  return component.render(240).join("\n");
}

function sessionDouble(
  options: StartAgentRunOptions<string>,
  config: RunDoubleConfig,
): { session: AgentRunSessionView; emit: (event: AgentSessionEvent) => void } {
  const listeners = new Set<(event: AgentSessionEvent) => void>();
  const session: AgentRunSessionView = {
    cwd: options.inputs.cwd,
    model: options.inputs.model,
    thinkingLevel: options.inputs.thinkingLevel,
    isStreaming: false,
    messages: config.messages ?? [],
    getActiveToolNames: () => options.inputs.tools,
    getSessionStats: () => ({
      sessionFile: undefined,
      sessionId: "test-session",
      userMessages: 0,
      assistantMessages: 0,
      toolCalls: 0,
      toolResults: 0,
      totalMessages: 0,
      tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      cost: 0,
    }),
    getLastAssistantText: () => config.value ?? "controlled result",
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return {
    session,
    emit: (event) => {
      for (const listener of listeners) listener(event);
    },
  };
}

export function runDouble(
  options: StartAgentRunOptions<string>,
  config: RunDoubleConfig = {},
): AgentRunHandle<string> {
  const controlled = sessionDouble(options, config);
  const observerCleanup = options.observer?.(controlled.session);
  for (const event of config.events ?? []) controlled.emit(event);

  return {
    result: Promise.resolve(observerCleanup).then((cleanup) => {
      cleanup?.();
      return { kind: "success" as const, value: config.value ?? "controlled result" };
    }),
    subscribe: vi.fn((listener) => {
      listener({ status: "starting", turns: 0, toolUses: 0, toolErrors: 0 });
      return () => undefined;
    }),
    steer: vi.fn(async () => "not-running" as const),
    stop: vi.fn(async () => undefined),
  };
}

export function context(): ExtensionContext {
  const model = {
    provider: "test",
    id: "model",
    name: "Test",
    api: "openai-completions",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 32_000,
    maxTokens: 4_000,
  };
  return makeCtx({
    cwd: "/repo",
    model,
    modelRegistry: {
      find: () => model,
      hasConfiguredAuth: () => true,
    },
    thinkingLevel: "medium",
    scopedModels: [],
    isProjectTrusted: () => false,
    signal: undefined,
  }) as unknown as ExtensionContext;
}

export async function registerAgentRunToolForTest(
  extension: (pi: ExtensionAPI) => void,
  shutdowns: Shutdown[],
): Promise<RegisteredAgentRunTool> {
  vi.stubEnv("PI_CODING_AGENT_DIR", "/tmp/supi-agent-boundary-test-agent-dir");
  const pi = createPiMock();
  extension(pi as unknown as ExtensionAPI);
  const sessionStart = getHandlerOrThrow(pi, "session_start");
  await sessionStart({ type: "session_start", reason: "startup" }, context());
  const sessionShutdown = getHandlerOrThrow(pi, "session_shutdown");
  shutdowns.push(async () => {
    await sessionShutdown({ type: "session_shutdown", reason: "test" }, context());
  });
  return getTool(pi, "supi_agent_run") as unknown as RegisteredAgentRunTool;
}

export async function shutdownRegisteredTools(shutdowns: Shutdown[]): Promise<void> {
  await Promise.all(shutdowns.splice(0).map((shutdown) => shutdown()));
}
