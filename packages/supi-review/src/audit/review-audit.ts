import type { Usage } from "@earendil-works/pi-ai";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import type { AgentRunSessionView } from "@mrclrchtr/supi-agent-runtime/api";
import type { ReviewSnapshotSummary, ReviewTask, ReviewWorkspaceReceipt } from "../types.ts";

const OMIT = Symbol("omit-audit-value");
/** Maximum compact lifecycle entries retained alongside one raw replay. */
export const REVIEW_AUDIT_TIMELINE_MAX = 2_000;

type ReplayValue =
  | null
  | boolean
  | number
  | string
  | ReplayValue[]
  | { [key: string]: ReplayValue };

/** One timestamped lifecycle observation retained beside an opt-in replay. */
export interface ReviewAuditTimelineEntry {
  atMs: number;
  type:
    | "agent_start"
    | "agent_end"
    | "agent_settled"
    | "turn_start"
    | "turn_end"
    | "tool_start"
    | "tool_end"
    | "recovery_turn_start"
    | "recovery_turn_end"
    | "model_switch_succeeded"
    | "model_switch_failed";
  toolCallId?: string;
  toolName?: string;
  isError?: boolean;
  modelId?: string;
  outcome?: string;
}

/** Bounded metadata that helps diagnose review direction and resource use. */
export interface ReviewAuditTrace {
  startedAt: string;
  durationMs: number;
  timeline: ReviewAuditTimelineEntry[];
  droppedTimelineEntries: number;
  usage?: Usage;
}

/** Locally persisted replay body for one explicitly audited Reviewer Session. */
export interface ReviewAuditRecordInput {
  task: ReviewTask;
  modelId: string;
  thinkingLevel: string;
  protocolPrompt: string;
  packet: string;
  packetHash: string;
  snapshot: ReviewSnapshotSummary;
  workspaceReceipt: ReviewWorkspaceReceipt;
  outcome: { kind: string; failureCode?: string; timeoutMs?: number };
  trace: ReviewAuditTrace;
  messages: ReplayValue[];
}

/** Complete on-disk representation of an opt-in reviewer replay. */
export interface ReviewAuditRecord extends ReviewAuditRecordInput {
  format: "supi-review-audit/v1";
  artifactId: string;
  createdAt: string;
  expiresAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function replayValue(value: unknown): ReplayValue | typeof OMIT {
  if (value === undefined) return OMIT;
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const values = value.map(replayValue).filter((entry): entry is ReplayValue => entry !== OMIT);
    return values;
  }
  if (!isRecord(value)) return String(value);
  if (value.type === "thinking") return OMIT;

  const result: { [key: string]: ReplayValue } = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === "thinking" || key === "thinkingSignature" || key === "thoughtSignature") continue;
    const replayed = replayValue(child);
    if (replayed !== OMIT) result[key] = replayed;
  }
  return result;
}

/** Copy provider-visible messages while deliberately excluding thinking blocks and signatures. */
export function captureReplayMessages(messages: unknown): ReplayValue[] {
  if (!Array.isArray(messages)) return [];
  return messages.map(replayValue).filter((message): message is ReplayValue => message !== OMIT);
}

function asUsage(value: unknown): Usage | undefined {
  return isRecord(value) && typeof value.input === "number" && typeof value.output === "number"
    ? (value as unknown as Usage)
    : undefined;
}

/** Collects a compact lifecycle timeline while the complete replay remains in session memory. */
export class ReviewAuditTraceCollector {
  readonly #startedAt: number;
  readonly #timeline: ReviewAuditTimelineEntry[] = [];
  #droppedTimelineEntries = 0;

  constructor(private readonly now: () => number = Date.now) {
    this.#startedAt = now();
  }

  observe(event: AgentSessionEvent): void {
    const atMs = Math.max(0, this.now() - this.#startedAt);
    switch (event.type) {
      case "agent_start":
      case "agent_end":
      case "agent_settled":
      case "turn_start":
      case "turn_end":
        this.#push({ atMs, type: event.type });
        break;
      case "tool_execution_start":
        this.#push({
          atMs,
          type: "tool_start",
          toolCallId: event.toolCallId,
          toolName: event.toolName,
        });
        break;
      case "tool_execution_end":
        this.#push({
          atMs,
          type: "tool_end",
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          isError: event.isError,
        });
        break;
      default:
        break;
    }
  }

  /** Add one bounded host-owned recovery marker to the continuous replay timeline. */
  markRecovery(entry: Omit<ReviewAuditTimelineEntry, "atMs">): void {
    this.#push({ atMs: Math.max(0, this.now() - this.#startedAt), ...entry });
  }

  #push(entry: ReviewAuditTimelineEntry): void {
    this.#timeline.push(entry);
    if (this.#timeline.length <= REVIEW_AUDIT_TIMELINE_MAX) return;
    this.#timeline.shift();
    this.#droppedTimelineEntries++;
  }

  snapshot(
    session: Pick<AgentRunSessionView, "messages">,
    aggregateUsage?: Usage,
  ): { trace: ReviewAuditTrace; messages: ReplayValue[] } {
    const finishedAt = this.now();
    let messages: unknown = [];
    let usage: Usage | undefined;
    try {
      messages = session.messages;
      const assistant = Array.isArray(messages)
        ? [...messages]
            .reverse()
            .find((message) => isRecord(message) && message.role === "assistant")
        : undefined;
      usage = asUsage(assistant && isRecord(assistant) ? assistant.usage : undefined);
    } catch {
      // Capturing is optional and never changes the review outcome.
    }
    return {
      trace: {
        startedAt: new Date(this.#startedAt).toISOString(),
        durationMs: Math.max(0, finishedAt - this.#startedAt),
        timeline: this.#timeline.map((entry) => ({ ...entry })),
        droppedTimelineEntries: this.#droppedTimelineEntries,
        ...((aggregateUsage ?? usage) ? { usage: aggregateUsage ?? usage } : {}),
      },
      messages: captureReplayMessages(messages),
    };
  }
}
