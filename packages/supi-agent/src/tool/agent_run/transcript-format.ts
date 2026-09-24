import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import type { AgentRunMessage } from "@mrclrchtr/supi-agent-runtime/api";
import type {
  AgentRunTranscriptDocument,
  AgentRunTranscriptMetadata,
  AgentRunTranscriptOperation,
  AgentRunTranscriptStatus,
} from "./transcript-store.ts";

interface HeaderRecord {
  readonly kind: "header";
  readonly metadata: AgentRunTranscriptMetadata;
  readonly systemPrompt: string;
  readonly occurredAt: number;
}

interface MessageRecord {
  readonly kind: "message";
  readonly message: AgentRunMessage;
}

interface PromptRecord {
  readonly kind: "system-prompt";
  readonly text: string;
  readonly occurredAt: number;
}

interface OperationRecord {
  readonly kind: "operation";
  readonly operation: AgentRunTranscriptOperation;
}

interface StatusRecord {
  readonly kind: "status";
  readonly status: AgentRunTranscriptStatus;
}

export type TranscriptRecord =
  | HeaderRecord
  | MessageRecord
  | PromptRecord
  | OperationRecord
  | StatusRecord;

const excludedField =
  /^(?:.*api[_-]?(?:key|token|secret|credentials?)|token|bearer|authorization|auth.*|access[_-]?token|refresh[_-]?token|session[_-]?token|bearer[_-]?token|client[_-]?secret|provider[_-]?(?:auth|token|secret|credentials?)|secret|credentials?|password|cookie|set-cookie|.*headers?|providerMetadata|providerResponse|.*debug.*|transport.*)$/i;

/** Remove credentials and provider debug data from a transcript message. */
export function sanitizeMessage(message: unknown): AgentRunMessage {
  return sanitizeValue(message) as AgentRunMessage;
}

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (!value || typeof value !== "object") return value;
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (excludedField.test(key)) continue;
    output[key] = sanitizeValue(child);
  }
  return output;
}

/** Read transcript records and flag malformed storage as incomplete. */
export function parseTranscript(
  content: string,
  fallback: AgentRunTranscriptDocument,
): AgentRunTranscriptDocument {
  let metadata = fallback.metadata;
  let systemPrompt = fallback.systemPrompt;
  let systemPromptHistory = [...fallback.systemPromptHistory];
  const messages: AgentRunMessage[] = [];
  const operations: AgentRunTranscriptOperation[] = [];
  let status = fallback.status;
  for (const line of content.split("\n")) {
    if (!line) continue;
    let record: TranscriptRecord;
    try {
      record = JSON.parse(line) as TranscriptRecord;
    } catch {
      status = "incomplete";
      break;
    }
    switch (record.kind) {
      case "header":
        metadata = record.metadata;
        systemPrompt = record.systemPrompt;
        systemPromptHistory = [{ occurredAt: record.occurredAt, text: record.systemPrompt }];
        break;
      case "message":
        messages.push(record.message);
        break;
      case "system-prompt":
        systemPrompt = record.text;
        systemPromptHistory.push({ occurredAt: record.occurredAt, text: record.text });
        break;
      case "operation":
        operations.push(record.operation);
        break;
      case "status":
        status = record.status;
        break;
    }
  }
  return {
    metadata,
    systemPrompt,
    systemPromptHistory,
    messages,
    operations,
    status,
    messageCount: messages.length,
  };
}

/** Project only safe lifecycle fields from Pi's session events. */
export function projectOperation(
  event: AgentSessionEvent,
): AgentRunTranscriptOperation | undefined {
  const occurredAt = Date.now();
  switch (event.type) {
    case "agent_start":
    case "agent_settled":
    case "turn_start":
      return { type: event.type, occurredAt };
    case "agent_end":
      return { type: event.type, occurredAt, willRetry: event.willRetry };
    case "turn_end":
      return { type: event.type, occurredAt };
    case "tool_execution_start":
      return {
        type: event.type,
        occurredAt,
        toolName: event.toolName,
        toolCallId: event.toolCallId,
      };
    case "tool_execution_end":
      return {
        type: event.type,
        occurredAt,
        toolName: event.toolName,
        toolCallId: event.toolCallId,
        isError: event.isError,
      };
    case "compaction_start":
      return { type: event.type, occurredAt, reason: event.reason };
    case "compaction_end": {
      const result = event.result;
      return {
        type: event.type,
        occurredAt,
        reason: event.reason,
        aborted: event.aborted,
        willRetry: event.willRetry,
        ...(result
          ? {
              summary: result.summary,
              firstKeptEntryId: result.firstKeptEntryId,
              tokensBefore: result.tokensBefore,
              ...(result.estimatedTokensAfter === undefined
                ? {}
                : { estimatedTokensAfter: result.estimatedTokensAfter }),
              ...(result.usage === undefined ? {} : { usage: sanitizeValue(result.usage) }),
              ...(result.details === undefined ? {} : { details: sanitizeValue(result.details) }),
            }
          : {}),
      };
    }
    case "auto_retry_start":
      return {
        type: event.type,
        occurredAt,
        attempt: event.attempt,
        maxAttempts: event.maxAttempts,
        delayMs: event.delayMs,
      };
    case "auto_retry_end":
      return { type: event.type, occurredAt, success: event.success, attempt: event.attempt };
    case "thinking_level_changed":
      return { type: event.type, occurredAt, level: event.level };
    default:
      return undefined;
  }
}
