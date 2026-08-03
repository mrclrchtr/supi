import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import { sanitizeAgentRunErrorText } from "./diagnostic-sanitizer.ts";
import type {
  AgentRunLifecycleTrace,
  AgentRunLifecycleTraceEntry,
  SafeAssistantStopReason,
} from "./types.ts";

/** Maximum lifecycle entries retained per Agent Run. */
export const AGENT_RUN_LIFECYCLE_TRACE_MAX = 32;
/** Maximum compact activity entries retained per Agent Run. */
export const AGENT_RUN_RECENT_ACTIVITY_MAX = 10;

const STOP_REASONS = new Set<SafeAssistantStopReason>([
  "stop",
  "length",
  "toolUse",
  "error",
  "aborted",
]);
const COMPACTION_REASONS = new Set(["manual", "threshold", "overflow"]);

type CompactionReason = "manual" | "threshold" | "overflow";

/** Return an allowlisted assistant stop reason. */
export function toSafeAssistantStopReason(value: unknown): SafeAssistantStopReason | undefined {
  return typeof value === "string" && STOP_REASONS.has(value as SafeAssistantStopReason)
    ? (value as SafeAssistantStopReason)
    : undefined;
}

/** Read active tool names without allowing a provider/session error to escape. */
export function getRegisteredToolNames(session: { getActiveToolNames(): string[] }): Set<string> {
  try {
    return new Set(
      session.getActiveToolNames().filter((name): name is string => typeof name === "string"),
    );
  } catch {
    return new Set();
  }
}

/** Collects bounded allowlisted lifecycle metadata for one run. */
export class AgentRunLifecycleTraceCollector {
  readonly #entries: AgentRunLifecycleTraceEntry[] = [];
  readonly #recentActivity: string[] = [];
  #droppedCount = 0;

  constructor(private readonly registeredToolNames: ReadonlySet<string> = new Set()) {}

  /** Observe one PI event without retaining arbitrary event payloads. */
  observe(event: AgentSessionEvent): void {
    try {
      const entry = mapLifecycleEvent(event);
      if (entry) this.#push(entry);
      const activity = summarizeRecentActivity(event, this.registeredToolNames);
      if (activity) this.#pushRecentActivity(activity);
    } catch {
      // A malformed future/provider event is not diagnostic evidence.
    }
  }

  /** Record a host control transition. */
  recordHostMarker(marker: AgentRunLifecycleTraceEntry): void {
    switch (marker.type) {
      case "timeout_expired":
      case "prompt_rejected":
        this.#push({ type: marker.type });
        break;
      case "abort_requested":
        this.#push({ type: "abort_requested", reason: marker.reason });
        break;
      default:
        break;
    }
  }

  /** Return a bounded copy that cannot be changed through collector state. */
  snapshot(): AgentRunLifecycleTrace {
    return {
      entries: this.#entries.map((entry) => ({ ...entry })),
      droppedCount: this.#droppedCount,
    };
  }

  /** Return the separate bounded activity lane used by diagnostics. */
  recentActivitySnapshot(): string[] {
    return [...this.#recentActivity];
  }

  #push(entry: AgentRunLifecycleTraceEntry): void {
    this.#entries.push(entry);
    if (this.#entries.length <= AGENT_RUN_LIFECYCLE_TRACE_MAX) return;
    this.#entries.shift();
    this.#droppedCount++;
  }

  #pushRecentActivity(activity: string): void {
    this.#recentActivity.push(activity);
    if (this.#recentActivity.length > AGENT_RUN_RECENT_ACTIVITY_MAX) this.#recentActivity.shift();
  }
}

/** Find the most recent safe provider error in the lifecycle tail. */
export function extractLastLifecycleErrorText(trace: AgentRunLifecycleTrace): string | undefined {
  for (let index = trace.entries.length - 1; index >= 0; index--) {
    const entry = trace.entries[index];
    if (entry.type === "compaction_end" && entry.errorText) return entry.errorText;
    if (entry.type === "auto_retry_end" && entry.finalErrorText) return entry.finalErrorText;
  }
  return undefined;
}

/** Format the retained lifecycle tail without exposing raw event payloads. */
export function formatAgentRunLifecycleTrace(trace: AgentRunLifecycleTrace): string {
  const tail =
    trace.droppedCount > 0
      ? `incomplete observed tail; ${trace.droppedCount} older ${trace.droppedCount === 1 ? "entry" : "entries"} dropped`
      : "observed tail";
  const entries = trace.entries.map(formatEntry);
  return `Agent Run Lifecycle Trace (${tail}): ${entries.length > 0 ? entries.join(" → ") : "(no observed lifecycle entries)"}`;
}

function formatEntry(entry: AgentRunLifecycleTraceEntry): string {
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
      return `summarization_retry_attempt_start(source=${entry.source}${entry.reason ? `, reason=${entry.reason}` : ""})`;
    case "queue_update":
      return `queue_update(steering=${entry.steeringCount}, followUp=${entry.followUpCount})`;
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
      const reason = toSafeAssistantStopReason(message.stopReason);
      return `assistant:end${reason ? `:${reason}` : ""}`;
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

function isReason(value: unknown): value is CompactionReason {
  return typeof value === "string" && COMPACTION_REASONS.has(value);
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the explicit event allowlist keeps retained fields auditable.
function mapLifecycleEvent(event: AgentSessionEvent): AgentRunLifecycleTraceEntry | undefined {
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
      return isReason(event.reason)
        ? { type: "compaction_start", reason: event.reason }
        : undefined;
    case "compaction_end":
      return isReason(event.reason) &&
        typeof event.aborted === "boolean" &&
        typeof event.willRetry === "boolean"
        ? {
            type: "compaction_end",
            reason: event.reason,
            aborted: event.aborted,
            willRetry: event.willRetry,
            hasResult: event.result !== undefined,
            hasError: event.errorMessage !== undefined,
            errorText: sanitizeAgentRunErrorText(event.errorMessage),
          }
        : undefined;
    case "auto_retry_start":
      return isCount(event.attempt) && isCount(event.maxAttempts) && isCount(event.delayMs)
        ? {
            type: "auto_retry_start",
            attempt: event.attempt,
            maxAttempts: event.maxAttempts,
            delayMs: event.delayMs,
          }
        : undefined;
    case "auto_retry_end":
      return typeof event.success === "boolean" && isCount(event.attempt)
        ? {
            type: "auto_retry_end",
            success: event.success,
            attempt: event.attempt,
            hasFinalError: event.finalError !== undefined,
            finalErrorText: sanitizeAgentRunErrorText(event.finalError),
          }
        : undefined;
    case "summarization_retry_scheduled":
      return isCount(event.attempt) && isCount(event.maxAttempts) && isCount(event.delayMs)
        ? {
            type: "summarization_retry_scheduled",
            attempt: event.attempt,
            maxAttempts: event.maxAttempts,
            delayMs: event.delayMs,
          }
        : undefined;
    case "summarization_retry_attempt_start":
      if (event.source === "branchSummary")
        return { type: "summarization_retry_attempt_start", source: event.source };
      return event.source === "compaction" && isReason(event.reason)
        ? { type: "summarization_retry_attempt_start", source: event.source, reason: event.reason }
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
