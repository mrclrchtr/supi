import type { AgentSession } from "@earendil-works/pi-coding-agent";
import type {
  ChildFailureCode,
  ChildFailureDiagnostics,
  ChildStage,
  ReviewProgress,
} from "../types.ts";
import {
  type ChildLifecycleTrace,
  ChildLifecycleTraceCollector,
  extractLastLifecycleErrorText,
  formatChildLifecycleTrace,
  getRegisteredToolNames,
  toSafeAssistantStopReason,
} from "./child-lifecycle-trace.ts";
import { buildProgressTokens } from "./runner-helpers.ts";

/** Inputs used to create one safe non-success child-run diagnostic artifact. */
export interface BuildChildFailureDiagnosticsInput {
  progress: ReviewProgress;
  lifecycleTrace: ChildLifecycleTrace;
  recentActivity: string[];
  session?: AgentSession;
}

/** Build diagnostics from allowlisted control metadata only. */
export function buildChildFailureDiagnostics(
  input: BuildChildFailureDiagnosticsInput,
): ChildFailureDiagnostics {
  const { session } = input;
  const tokens = session
    ? buildProgressTokens(() => session.getSessionStats())
    : input.progress.tokens;
  const lastAssistant = session ? extractLastAssistantMetadata(session) : undefined;

  return {
    lifecycleTrace: input.lifecycleTrace,
    turns: input.progress.turns,
    toolUses: input.progress.toolUses,
    tokens,
    recentActivity: input.recentActivity.length > 0 ? [...input.recentActivity] : undefined,
    lastAssistantStopReason: lastAssistant?.stopReason,
    lastAssistantToolCalls: lastAssistant?.toolCalls,
    lastAssistantErrorText: lastAssistant?.errorText,
    lastLifecycleErrorText: extractLastLifecycleErrorText(input.lifecycleTrace),
  };
}

/** Create safe diagnostics when a host failure occurred without observed child lifecycle events. */
export function createUnobservedChildFailureDiagnostics(): ChildFailureDiagnostics {
  return buildChildFailureDiagnostics({
    progress: { turns: 0, toolUses: 0 },
    lifecycleTrace: { entries: [], droppedCount: 0 },
    recentActivity: [],
  });
}

/** Create safe cancellation diagnostics when no child session was started. */
export function createEarlyCancellationDiagnostics(): ChildFailureDiagnostics {
  const collector = new ChildLifecycleTraceCollector();
  collector.recordHostMarker({ type: "abort_requested", reason: "canceled" });
  return buildChildFailureDiagnostics({
    progress: { turns: 0, toolUses: 0 },
    lifecycleTrace: collector.snapshot(),
    recentActivity: collector.recentActivitySnapshot(),
  });
}

/** Generate static parent-facing copy for a host-owned child failure code. */
export function formatChildFailureCopy(stage: ChildStage, code: ChildFailureCode): string {
  const label = stage === "planner" ? "Planner" : "Reviewer";
  switch (code) {
    case "session-creation-failed":
      return `${label} session could not be created.`;
    case "prompt-rejected":
      return `${label} prompt was rejected before it ran.`;
    case "missing-structured-output":
      return `${label} ended without the required structured output.`;
    case "unexpected-runner-failure":
      return `${label} ended unexpectedly.`;
  }
}

/** Format the complete retained safe diagnostic artifact for parent-facing text. */
export function formatChildFailureDiagnostics(diagnostics: ChildFailureDiagnostics): string[] {
  const lines = [
    `- Turns: ${diagnostics.turns}`,
    `- Tool uses: ${diagnostics.toolUses}`,
    diagnostics.tokens
      ? `- Tokens: ${diagnostics.tokens.input} in / ${diagnostics.tokens.output} out / ${diagnostics.tokens.total} total`
      : undefined,
    diagnostics.recentActivity && diagnostics.recentActivity.length > 0
      ? `- Recent activity: ${diagnostics.recentActivity.join(" → ")}`
      : undefined,
    diagnostics.lastAssistantStopReason
      ? `- Last assistant stop: ${diagnostics.lastAssistantStopReason}`
      : undefined,
    diagnostics.lastAssistantToolCalls && diagnostics.lastAssistantToolCalls.length > 0
      ? `- Last assistant tools: ${diagnostics.lastAssistantToolCalls.join(", ")}`
      : undefined,
    diagnostics.lastAssistantErrorText
      ? `- Last assistant error: ${diagnostics.lastAssistantErrorText}`
      : undefined,
    diagnostics.lastLifecycleErrorText &&
    diagnostics.lastLifecycleErrorText !== diagnostics.lastAssistantErrorText
      ? `- Lifecycle error: ${diagnostics.lastLifecycleErrorText}`
      : undefined,
    `- ${formatChildLifecycleTrace(diagnostics.lifecycleTrace)}`,
  ];
  return lines.filter((line): line is string => !!line);
}

interface LastAssistantMetadata {
  stopReason?: string;
  toolCalls?: string[];
  errorText?: string;
}

function extractLastAssistantMetadata(session: AgentSession): LastAssistantMetadata | undefined {
  try {
    const messages = session.messages as unknown;
    if (!Array.isArray(messages)) return undefined;

    const registeredToolNames = getRegisteredToolNames(session);
    for (let index = messages.length - 1; index >= 0; index--) {
      const message = messages[index] as Record<string, unknown> | undefined;
      if (message?.role !== "assistant") continue;

      const stopReason = toSafeAssistantStopReason(message.stopReason);
      const toolCalls = extractAssistantToolCalls(message.content, registeredToolNames);
      const errorText = stopReason === "error" ? extractAssistantErrorText(message) : undefined;
      return {
        stopReason,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        errorText,
      };
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function extractAssistantToolCalls(content: unknown, registeredToolNames: Set<string>): string[] {
  if (!Array.isArray(content)) return [];

  return content
    .map((part) => {
      if (typeof part !== "object" || !part) return undefined;
      const tool = part as { type?: unknown; name?: unknown };
      return tool.type === "toolCall" &&
        typeof tool.name === "string" &&
        registeredToolNames.has(tool.name)
        ? tool.name
        : undefined;
    })
    .filter((name): name is string => !!name);
}

/** Extract error text from content text parts when the model embeds an error message. */
function extractContentErrorText(content: unknown): string | undefined {
  if (!Array.isArray(content)) return undefined;
  const textParts = content
    .filter(
      (part): part is { type: "text"; text: string } =>
        typeof part === "object" &&
        part !== null &&
        (part as { type?: unknown }).type === "text" &&
        typeof (part as { text?: unknown }).text === "string",
    )
    .map((part) => part.text);
  if (textParts.length === 0) return undefined;
  const joined = textParts.join("\n").trim();
  return joined || undefined;
}

/** Scan enumerable message keys for any error-like string property as a fallback. */
function scanMessageKeysForError(message: Record<string, unknown>): string | undefined {
  for (const key of Object.keys(message)) {
    if (!/error|message|reason/i.test(key)) continue;
    const value = message[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return undefined;
}

/** Extract error text from an errored assistant message, trying content text parts first then top-level error fields. */
function extractAssistantErrorText(message: Record<string, unknown>): string | undefined {
  // 1. Try content text parts (model may embed error in text)
  const contentError = extractContentErrorText(message.content);
  if (contentError) return contentError;

  // 2. Try top-level error message (provider-level error payload)
  if (typeof message.errorMessage === "string" && message.errorMessage.trim()) {
    return message.errorMessage;
  }
  if (typeof message.error === "string" && message.error.trim()) {
    return message.error;
  }

  // 3. Fallback: scan enumerable keys for any error-like string property
  return scanMessageKeysForError(message);
}
