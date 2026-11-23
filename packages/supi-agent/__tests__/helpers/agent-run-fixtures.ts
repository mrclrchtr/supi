import type { AgentSessionEvent, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type {
  AgentRunHandle,
  AgentRunMessage,
  AgentRunRegistry,
  AgentRunSessionView,
  StartAgentRunOptions,
} from "@mrclrchtr/supi-agent-runtime/api";
import { getAgentRunRegistry } from "@mrclrchtr/supi-agent-runtime/api";
import { createPiMock, getTool, type ToolDef } from "@mrclrchtr/supi-test-utils";
import { testModelContext as context } from "@mrclrchtr/supi-test-utils/background";
import { vi } from "vitest";

export type Renderable = { render: (width: number) => string[] };

export type RegisteredAgentRunTool = ToolDef & {
  renderCall: (...args: unknown[]) => Renderable;
  renderResult: (...args: unknown[]) => Renderable;
  registry: AgentRunRegistry;
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
    systemPrompt: "Child system prompt",
    model: options.inputs.model,
    thinkingLevel: options.inputs.thinkingLevel,
    isStreaming: false,
    messages: config.messages ?? [],
    getActiveToolNames: () => options.inputs.tools,
    getToolRenderers: () => [],
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

  return {
    steeringAvailable: false,
    get taskResult() {
      return this.result;
    },
    result: Promise.resolve()
      .then(() => options.observer?.(controlled.session))
      .then((cleanup) => {
        for (const event of config.events ?? []) controlled.emit(event);
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

/** The neutral parent test context, shared with the background harness. */
export { context };

export async function registerAgentRunToolForTest(
  extension: (pi: ExtensionAPI) => void,
  shutdowns: Shutdown[],
): Promise<RegisteredAgentRunTool> {
  vi.stubEnv("PI_CODING_AGENT_DIR", "/tmp/supi-agent-boundary-test-agent-dir");
  vi.stubEnv("HOME", "/tmp/supi-agent-boundary-test-home");
  const pi = createPiMock();
  extension(pi as unknown as ExtensionAPI);
  await pi.emit("session_start", { type: "session_start", reason: "startup" }, context());
  shutdowns.push(async () => {
    await pi.emit("session_shutdown", { type: "session_shutdown", reason: "test" }, context());
  });
  return {
    ...(getTool(pi, "agent_run") as unknown as Omit<RegisteredAgentRunTool, "registry">),
    registry: getAgentRunRegistry(pi as unknown as ExtensionAPI),
  };
}

export async function shutdownRegisteredTools(shutdowns: Shutdown[]): Promise<void> {
  await Promise.all(shutdowns.splice(0).map((shutdown) => shutdown()));
}
