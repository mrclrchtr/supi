import type { AgentSession, AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import type { ReviewFailureDebugInfo, ReviewProgress } from "../types.ts";
import { buildProgressTokens, extractAssistantText } from "./runner-helpers.ts";

export const RECENT_EVENTS_MAX = 10;
export const LAST_ASSISTANT_TEXT_DEBUG_MAX = 2_000;

export interface LastAssistantDebugInfo {
  text?: string;
  stopReason?: string;
  errorMessage?: string;
  toolCalls?: string[];
}

export function extractLastAssistantDebugFromMessages(
  messages: ArrayLike<Record<string, unknown>> | undefined,
): LastAssistantDebugInfo | undefined {
  if (!messages) return undefined;
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.role !== "assistant") continue;

    const text = extractAssistantText(message.content);
    const stopReason =
      typeof message.stopReason === "string" ? (message.stopReason as string) : undefined;
    const errorMessage =
      typeof message.errorMessage === "string" ? (message.errorMessage as string) : undefined;
    const toolCalls = extractAssistantToolCalls(message.content);

    return {
      text: text ? truncateText(text, LAST_ASSISTANT_TEXT_DEBUG_MAX) : undefined,
      stopReason,
      errorMessage,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  }
  return undefined;
}

export function extractLastAssistantDebug(
  session: AgentSession,
): LastAssistantDebugInfo | undefined {
  return extractLastAssistantDebugFromMessages(
    session.messages as unknown as Array<Record<string, unknown>>,
  );
}

export function extractLastAssistantText(session: AgentSession): string | undefined {
  const debug = extractLastAssistantDebug(session);
  return debug?.text;
}

function extractAssistantToolCalls(content: unknown): string[] {
  if (!Array.isArray(content)) return [];

  return content
    .map((part) => {
      if (typeof part !== "object" || !part) return undefined;
      const toolPart = part as { type?: unknown; name?: unknown };
      return toolPart.type === "toolCall" && typeof toolPart.name === "string"
        ? toolPart.name
        : undefined;
    })
    .filter((name): name is string => !!name);
}

export function summarizeSessionEvent(event: AgentSessionEvent): string | undefined {
  switch (event.type) {
    case "message_end": {
      const message = event.message as unknown as Record<string, unknown>;
      if (message.role !== "assistant") return undefined;
      const stopReason =
        typeof message.stopReason === "string" ? String(message.stopReason) : undefined;
      const suffix = stopReason ? `:${stopReason}` : "";
      return `assistant:end${suffix}`;
    }
    case "tool_execution_start":
      return `tool:start:${event.toolName}`;
    case "tool_execution_end":
      return `tool:end:${event.toolName}${event.isError ? ":error" : ""}`;
    case "turn_end":
      return "turn:end";
    case "agent_end":
      return `agent:end${event.willRetry ? ":retry" : ""}`;
    case "auto_retry_start":
      return `retry:start:${event.attempt}/${event.maxAttempts}`;
    case "auto_retry_end":
      return `retry:end:${event.success ? "success" : "failed"}`;
    default:
      return undefined;
  }
}

export function pushRecentEvent(recentEvents: string[], summary: string | undefined): void {
  if (!summary) return;
  recentEvents.push(summary);
  if (recentEvents.length > RECENT_EVENTS_MAX) {
    recentEvents.splice(0, recentEvents.length - RECENT_EVENTS_MAX);
  }
}

export interface BuildFailureDebugInput {
  progress: ReviewProgress;
  session: AgentSession;
  recentEvents: string[];
}

export function buildFailureDebug(input: BuildFailureDebugInput): ReviewFailureDebugInfo {
  input.progress.tokens = buildProgressTokens(() => input.session.getSessionStats());
  const lastAssistant = extractLastAssistantDebug(input.session);

  return {
    turns: input.progress.turns,
    toolUses: input.progress.toolUses,
    activities: input.progress.activities.length > 0 ? [...input.progress.activities] : undefined,
    tokens: input.progress.tokens,
    recentEvents: input.recentEvents.length > 0 ? [...input.recentEvents] : undefined,
    lastAssistantText: lastAssistant?.text,
    lastAssistantStopReason: lastAssistant?.stopReason,
    lastAssistantErrorMessage: lastAssistant?.errorMessage,
    lastAssistantToolCalls: lastAssistant?.toolCalls,
  };
}

function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}... (${text.length - maxLen} more chars)`;
}
