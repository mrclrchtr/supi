import type { AgentSession } from "@earendil-works/pi-coding-agent";
import { sanitizeAgentRunErrorText } from "./diagnostic-sanitizer.ts";
import {
  AgentRunLifecycleTraceCollector,
  extractLastLifecycleErrorText,
  formatAgentRunLifecycleTrace,
  getRegisteredToolNames,
  toSafeAssistantStopReason,
} from "./lifecycle-trace.ts";
import type { AgentRunDiagnostics, AgentRunLifecycleTrace, AgentRunProgress } from "./types.ts";

/** Build inputs for one bounded non-success diagnostic artifact. */
export interface BuildAgentRunDiagnosticsInput {
  progress: Pick<AgentRunProgress, "turns" | "toolUses" | "usage">;
  lifecycleTrace: AgentRunLifecycleTrace;
  recentActivity: readonly string[];
  session?: AgentSession;
}

/** Build diagnostics from allowlisted control metadata only. */
export function buildAgentRunDiagnostics(
  input: BuildAgentRunDiagnosticsInput,
): AgentRunDiagnostics {
  const tokens = input.session
    ? buildTokensFromSession(input.session)
    : input.progress.usage
      ? tokensFromUsage(input.progress.usage)
      : undefined;
  const lastAssistant = input.session ? extractLastAssistantMetadata(input.session) : undefined;
  return {
    lifecycleTrace: input.lifecycleTrace,
    turns: input.progress.turns,
    toolUses: input.progress.toolUses,
    ...(tokens ? { tokens } : {}),
    ...(input.recentActivity.length > 0 ? { recentActivity: [...input.recentActivity] } : {}),
    ...(lastAssistant?.stopReason ? { lastAssistantStopReason: lastAssistant.stopReason } : {}),
    ...(lastAssistant?.toolCalls ? { lastAssistantToolCalls: lastAssistant.toolCalls } : {}),
    ...(lastAssistant?.errorText ? { lastAssistantErrorText: lastAssistant.errorText } : {}),
    ...(extractLastLifecycleErrorText(input.lifecycleTrace)
      ? { lastLifecycleErrorText: extractLastLifecycleErrorText(input.lifecycleTrace) }
      : {}),
  };
}

/** Create safe diagnostics for a failure observed before session creation. */
export function createUnobservedAgentRunDiagnostics(): AgentRunDiagnostics {
  return buildAgentRunDiagnostics({
    progress: { turns: 0, toolUses: 0 },
    lifecycleTrace: { entries: [], droppedCount: 0 },
    recentActivity: [],
  });
}

/** Create safe diagnostics for cancellation before setup reaches a session. */
export function createEarlyCancellationDiagnostics(): AgentRunDiagnostics {
  const collector = new AgentRunLifecycleTraceCollector();
  collector.recordHostMarker({ type: "abort_requested", reason: "canceled" });
  return buildAgentRunDiagnostics({
    progress: { turns: 0, toolUses: 0 },
    lifecycleTrace: collector.snapshot(),
    recentActivity: collector.recentActivitySnapshot(),
  });
}

/** Format the bounded retained artifact for adapters that need parent-facing copy. */
export function formatAgentRunDiagnostics(diagnostics: AgentRunDiagnostics): string[] {
  return [
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
    ...getAgentRunDiagnosticErrorRows(diagnostics).map((row) => `- ${row.label}: ${row.text}`),
    `- ${formatAgentRunLifecycleTrace(diagnostics.lifecycleTrace)}`,
  ].filter((line): line is string => !!line);
}

/** One safe provider-error row used by adapter presentation. */
export interface AgentRunDiagnosticErrorRow {
  label: "Last assistant error" | "Lifecycle error";
  text: string;
}

/** Return distinct bounded provider-error summaries. */
export function getAgentRunDiagnosticErrorRows(
  diagnostics: AgentRunDiagnostics,
): AgentRunDiagnosticErrorRow[] {
  const rows: AgentRunDiagnosticErrorRow[] = [];
  if (diagnostics.lastAssistantErrorText) {
    rows.push({ label: "Last assistant error", text: diagnostics.lastAssistantErrorText });
  }
  if (
    diagnostics.lastLifecycleErrorText &&
    diagnostics.lastLifecycleErrorText !== diagnostics.lastAssistantErrorText
  ) {
    rows.push({ label: "Lifecycle error", text: diagnostics.lastLifecycleErrorText });
  }
  return rows;
}

function tokensFromUsage(usage: {
  input: number;
  output: number;
  totalTokens: number;
  cacheRead: number;
  cacheWrite: number;
}) {
  return {
    input: usage.input,
    output: usage.output,
    total: usage.totalTokens,
    cacheRead: usage.cacheRead,
    cacheWrite: usage.cacheWrite,
  };
}

function buildTokensFromSession(session: AgentSession) {
  try {
    const stats = session.getSessionStats();
    return {
      input: stats.tokens.input,
      output: stats.tokens.output,
      total: stats.tokens.total,
      cacheRead: stats.tokens.cacheRead,
      cacheWrite: stats.tokens.cacheWrite,
    };
  } catch {
    return undefined;
  }
}

interface LastAssistantMetadata {
  stopReason?: AgentRunDiagnostics["lastAssistantStopReason"];
  toolCalls?: string[];
  errorText?: string;
}

function extractLastAssistantMetadata(session: AgentSession): LastAssistantMetadata | undefined {
  try {
    const messages = session.messages;
    const registeredToolNames = getRegisteredToolNames(session);
    for (let index = messages.length - 1; index >= 0; index--) {
      const message = messages[index] as unknown as Record<string, unknown> | undefined;
      if (message?.role !== "assistant") continue;
      const stopReason = toSafeAssistantStopReason(message.stopReason);
      const toolCalls = extractAssistantToolCalls(message.content, registeredToolNames);
      return {
        stopReason,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        errorText:
          stopReason === "error" ? sanitizeAgentRunErrorText(message.errorMessage) : undefined,
      };
    }
  } catch {
    // Diagnostics fail closed when session metadata is unavailable.
  }
  return undefined;
}

function extractAssistantToolCalls(
  content: unknown,
  registeredToolNames: ReadonlySet<string>,
): string[] {
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
