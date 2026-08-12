import type { ReviewAuditRecord } from "./review-audit.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Parse the fields required by Replay Outline and selected-message views. */
export function parseReviewAuditRecord(text: string): ReviewAuditRecord {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (cause) {
    throw new Error('Reviewer replay is not valid JSON. Use view: "raw" for exact access.', {
      cause,
    });
  }
  if (
    !isRecord(value) ||
    value.format !== "supi-review-audit/v1" ||
    !Array.isArray(value.messages)
  ) {
    throw new Error(
      'Reviewer replay is not a supported supi-review-audit/v1 record. Use view: "raw" for exact access.',
    );
  }
  return value as unknown as ReviewAuditRecord;
}

/** Serialize one persisted message without changing its captured value or array position. */
export function serializeReplayMessage(record: ReviewAuditRecord, messageIndex: number): string {
  if (!Number.isSafeInteger(messageIndex) || messageIndex < 0) {
    throw new Error('view: "message" requires a non-negative integer messageIndex.');
  }
  if (messageIndex >= record.messages.length) {
    throw new Error(
      `messageIndex ${messageIndex} is out of range. Use an index from 0 to ${Math.max(0, record.messages.length - 1)}.`,
    );
  }
  return JSON.stringify(record.messages[messageIndex], null, 2) ?? "null";
}
