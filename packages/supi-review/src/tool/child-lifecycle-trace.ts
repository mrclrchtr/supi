import type { AgentSession, AgentSessionEvent } from "@earendil-works/pi-coding-agent";

/** Maximum number of observed Child Lifecycle Trace entries retained per child run. */
export const CHILD_LIFECYCLE_TRACE_MAX = 32;

/** Maximum number of compact Recent Activity entries retained per child run. */
export const RECENT_ACTIVITY_MAX = 10;

/** Pi-defined assistant stop reasons safe to retain in diagnostics. */
export type SafeAssistantStopReason = "stop" | "length" | "toolUse" | "error" | "aborted";

type CompactionReason = "manual" | "threshold" | "overflow";

const SAFE_ASSISTANT_STOP_REASONS = new Set<SafeAssistantStopReason>([
  "stop",
  "length",
  "toolUse",
  "error",
  "aborted",
]);
const COMPACTION_REASONS = new Set<CompactionReason>(["manual", "threshold", "overflow"]);

/** Return a stop reason only when it is one of Pi's defined lifecycle values. */
export function toSafeAssistantStopReason(value: unknown): SafeAssistantStopReason | undefined {
  return typeof value === "string" &&
    SAFE_ASSISTANT_STOP_REASONS.has(value as SafeAssistantStopReason)
    ? (value as SafeAssistantStopReason)
    : undefined;
}

/** Read the child session's active registered tool names without exposing failures. */
export function getRegisteredToolNames(session: AgentSession): Set<string> {
  try {
    const names = session.getActiveToolNames() as unknown;
    return Array.isArray(names)
      ? new Set(names.filter((name): name is string => typeof name === "string"))
      : new Set();
  } catch {
    return new Set();
  }
}

/** One allowlisted lifecycle transition retained for a managed child session. */
export type ChildLifecycleTraceEntry =
  | { type: "agent_start" }
  | { type: "agent_end"; willRetry: boolean }
  | { type: "agent_settled" }
  | { type: "compaction_start"; reason: CompactionReason }
  | {
      type: "compaction_end";
      reason: CompactionReason;
      aborted: boolean;
      willRetry: boolean;
      hasResult: boolean;
      hasError: boolean;
      errorText?: string;
    }
  | { type: "auto_retry_start"; attempt: number; maxAttempts: number; delayMs: number }
  | {
      type: "auto_retry_end";
      success: boolean;
      attempt: number;
      hasFinalError: boolean;
      finalErrorText?: string;
    }
  | {
      type: "summarization_retry_scheduled";
      attempt: number;
      maxAttempts: number;
      delayMs: number;
    }
  | {
      type: "summarization_retry_attempt_start";
      source: "branchSummary" | "compaction";
      reason?: CompactionReason;
    }
  | { type: "summarization_retry_finished" }
  | { type: "queue_update"; steeringCount: number; followUpCount: number }
  | ChildLifecycleHostMarker;

/** Minimal runner-control transitions that explain host-originated termination. */
export type ChildLifecycleHostMarker =
  | { type: "steer_requested"; reason: "submit" | "timeout" }
  | { type: "timeout_expired" }
  | { type: "abort_requested"; reason: "canceled" | "timeout" }
  | { type: "prompt_rejected" };

/** Bounded observed tail of lifecycle transitions for one managed child session. */
export interface ChildLifecycleTrace {
  entries: ChildLifecycleTraceEntry[];
  droppedCount: number;
}

/**
 * Retains only allowlisted lifecycle metadata for one managed child session.
 *
 * Entries are copied into a bounded observed tail so raw SDK events and their
 * potentially sensitive payloads never escape the runner.
 */
export class ChildLifecycleTraceCollector {
  private readonly entries: ChildLifecycleTraceEntry[] = [];
  private readonly recentActivity: string[] = [];
  private droppedCount = 0;

  constructor(private readonly registeredToolNames: ReadonlySet<string> = new Set()) {}

  /** Record one Pi session event when it belongs to the explicit allowlist. */
  observe(event: AgentSessionEvent): void {
    let entry: ChildLifecycleTraceEntry | undefined;
    let activity: string | undefined;
    try {
      entry = mapLifecycleEvent(event);
      activity = summarizeRecentActivity(event, this.registeredToolNames);
    } catch {
      return;
    }

    if (entry) this.push(entry);
    if (activity) this.pushRecentActivity(activity);
  }

  /** Record an allowlisted runner-control transition. */
  recordHostMarker(marker: ChildLifecycleHostMarker): void {
    switch (marker.type) {
      case "steer_requested":
        if (marker.reason === "submit" || marker.reason === "timeout") {
          this.push({ type: "steer_requested", reason: marker.reason });
        }
        break;
      case "abort_requested":
        if (marker.reason === "canceled" || marker.reason === "timeout") {
          this.push({ type: "abort_requested", reason: marker.reason });
        }
        break;
      case "timeout_expired":
        this.push({ type: "timeout_expired" });
        break;
      case "prompt_rejected":
        this.push({ type: "prompt_rejected" });
        break;
    }
  }

  /** Return an immutable-by-convention copy suitable for a failure artifact. */
  snapshot(): ChildLifecycleTrace {
    return {
      entries: this.entries.map((entry) => ({ ...entry })),
      droppedCount: this.droppedCount,
    };
  }

  /** Return the separate, presentation-only Recent Activity lane. */
  recentActivitySnapshot(): string[] {
    return [...this.recentActivity];
  }

  private push(entry: ChildLifecycleTraceEntry): void {
    this.entries.push(entry);
    if (this.entries.length <= CHILD_LIFECYCLE_TRACE_MAX) return;

    this.entries.shift();
    this.droppedCount++;
  }

  private pushRecentActivity(activity: string): void {
    this.recentActivity.push(activity);
    if (this.recentActivity.length > RECENT_ACTIVITY_MAX) this.recentActivity.shift();
  }
}

/**
 * Extract error text from the most recent lifecycle entry that carries an error.
 * Checks compaction_end.errorText and auto_retry_end.finalErrorText.
 */
export function extractLastLifecycleErrorText(trace: ChildLifecycleTrace): string | undefined {
  // Walk backwards to find the most recent error
  for (let i = trace.entries.length - 1; i >= 0; i--) {
    const entry = trace.entries[i];
    if (entry.type === "compaction_end" && entry.errorText) return entry.errorText;
    if (entry.type === "auto_retry_end" && entry.finalErrorText) return entry.finalErrorText;
  }
  return undefined;
}

/** Format the complete retained Child Lifecycle Trace for parent-facing diagnostics. */
export function formatChildLifecycleTrace(trace: ChildLifecycleTrace): string {
  const tail =
    trace.droppedCount > 0
      ? `incomplete observed tail; ${trace.droppedCount} older ${trace.droppedCount === 1 ? "entry" : "entries"} dropped`
      : "observed tail";
  const entries = trace.entries.map(formatChildLifecycleTraceEntry);
  const body = entries.length > 0 ? entries.join(" → ") : "(no observed lifecycle entries)";
  return `Child Lifecycle Trace (${tail}): ${body}`;
}

function formatChildLifecycleTraceEntry(entry: ChildLifecycleTraceEntry): string {
  switch (entry.type) {
    case "agent_start":
    case "agent_settled":
    case "summarization_retry_finished":
    case "timeout_expired":
    case "prompt_rejected":
      return entry.type;
    case "agent_end":
      return `agent_end(willRetry=${entry.willRetry})`;
    case "compaction_start":
      return `compaction_start(reason=${entry.reason})`;
    case "compaction_end":
      return `compaction_end(reason=${entry.reason}, aborted=${entry.aborted}, willRetry=${entry.willRetry}, hasResult=${entry.hasResult}, hasError=${entry.hasError}${entry.errorText ? `, error=${JSON.stringify(entry.errorText)}` : ""})`;
    case "auto_retry_start":
      return `auto_retry_start(attempt=${entry.attempt}/${entry.maxAttempts}, delayMs=${entry.delayMs})`;
    case "auto_retry_end":
      return `auto_retry_end(success=${entry.success}, attempt=${entry.attempt}, hasFinalError=${entry.hasFinalError}${entry.finalErrorText ? `, error=${JSON.stringify(entry.finalErrorText)}` : ""})`;
    case "summarization_retry_scheduled":
      return `summarization_retry_scheduled(attempt=${entry.attempt}/${entry.maxAttempts}, delayMs=${entry.delayMs})`;
    case "summarization_retry_attempt_start":
      return entry.reason
        ? `summarization_retry_attempt_start(source=${entry.source}, reason=${entry.reason})`
        : `summarization_retry_attempt_start(source=${entry.source})`;
    case "queue_update":
      return `queue_update(steering=${entry.steeringCount}, followUp=${entry.followUpCount})`;
    case "steer_requested":
      return `steer_requested(reason=${entry.reason})`;
    case "abort_requested":
      return `abort_requested(reason=${entry.reason})`;
  }
}

function summarizeRecentActivity(
  event: AgentSessionEvent,
  registeredToolNames: ReadonlySet<string>,
): string | undefined {
  switch (event.type) {
    case "message_end": {
      const message = event.message as { role?: unknown; stopReason?: unknown };
      if (message.role !== "assistant") return undefined;
      const stopReason = toSafeAssistantStopReason(message.stopReason);
      return `assistant:end${stopReason ? `:${stopReason}` : ""}`;
    }
    case "turn_start":
      return "turn:start";
    case "turn_end":
      return "turn:end";
    case "tool_execution_start":
      return typeof event.toolName === "string" && registeredToolNames.has(event.toolName)
        ? `tool:start:${event.toolName}`
        : undefined;
    case "tool_execution_end":
      return typeof event.toolName === "string" &&
        typeof event.isError === "boolean" &&
        registeredToolNames.has(event.toolName)
        ? `tool:end:${event.toolName}${event.isError ? ":error" : ""}`
        : undefined;
    default:
      return undefined;
  }
}

function isCompactionReason(value: unknown): value is CompactionReason {
  return typeof value === "string" && COMPACTION_REASONS.has(value as CompactionReason);
}

function isSafeCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one explicit allowlist keeps copied event fields auditable
function mapLifecycleEvent(event: AgentSessionEvent): ChildLifecycleTraceEntry | undefined {
  switch (event.type) {
    case "agent_start":
      return { type: "agent_start" };
    case "agent_end":
      return typeof event.willRetry === "boolean"
        ? { type: "agent_end", willRetry: event.willRetry }
        : undefined;
    case "agent_settled":
      return { type: "agent_settled" };
    case "compaction_start":
      return isCompactionReason(event.reason)
        ? { type: "compaction_start", reason: event.reason }
        : undefined;
    case "compaction_end":
      return isCompactionReason(event.reason) &&
        typeof event.aborted === "boolean" &&
        typeof event.willRetry === "boolean"
        ? {
            type: "compaction_end",
            reason: event.reason,
            aborted: event.aborted,
            willRetry: event.willRetry,
            hasResult: event.result !== undefined,
            hasError: event.errorMessage !== undefined,
            errorText:
              typeof event.errorMessage === "string" && event.errorMessage.trim()
                ? event.errorMessage
                : undefined,
          }
        : undefined;
    case "auto_retry_start":
      return isSafeCount(event.attempt) &&
        isSafeCount(event.maxAttempts) &&
        isSafeCount(event.delayMs)
        ? {
            type: "auto_retry_start",
            attempt: event.attempt,
            maxAttempts: event.maxAttempts,
            delayMs: event.delayMs,
          }
        : undefined;
    case "auto_retry_end":
      return typeof event.success === "boolean" && isSafeCount(event.attempt)
        ? {
            type: "auto_retry_end",
            success: event.success,
            attempt: event.attempt,
            hasFinalError: event.finalError !== undefined,
            finalErrorText:
              typeof event.finalError === "string" && event.finalError.trim()
                ? event.finalError
                : undefined,
          }
        : undefined;
    case "summarization_retry_scheduled":
      return isSafeCount(event.attempt) &&
        isSafeCount(event.maxAttempts) &&
        isSafeCount(event.delayMs)
        ? {
            type: "summarization_retry_scheduled",
            attempt: event.attempt,
            maxAttempts: event.maxAttempts,
            delayMs: event.delayMs,
          }
        : undefined;
    case "summarization_retry_attempt_start":
      if (event.source === "branchSummary") {
        return { type: "summarization_retry_attempt_start", source: "branchSummary" };
      }
      return event.source === "compaction" && isCompactionReason(event.reason)
        ? {
            type: "summarization_retry_attempt_start",
            source: "compaction",
            reason: event.reason,
          }
        : undefined;
    case "summarization_retry_finished":
      return { type: "summarization_retry_finished" };
    case "queue_update":
      return Array.isArray(event.steering) && Array.isArray(event.followUp)
        ? {
            type: "queue_update",
            steeringCount: event.steering.length,
            followUpCount: event.followUp.length,
          }
        : undefined;
    default:
      return undefined;
  }
}
