import type { Static } from "typebox";
import { Value } from "typebox/value";
import type { LocalReviewAuditStore } from "../../audit/local-review-audit-store.ts";
import { parseReviewAuditRecord, serializeReplayMessage } from "../../audit/review-audit-record.ts";
import {
  buildAuditListResult,
  buildAuditMessageResult,
  buildAuditOutlineResult,
  buildAuditRawResult,
} from "./result.ts";
import { reviewAuditSpec } from "./spec.ts";

export type ReviewAuditParams = Static<(typeof reviewAuditSpec)["parameters"]>;

function validateAuditCombination(params: ReviewAuditParams): void {
  if (params.view && !params.artifactId) {
    throw new Error("view requires artifactId. Omit view to list local replays.");
  }
  if (params.messageIndex !== undefined && params.view !== "message") {
    throw new Error('messageIndex is valid only with view: "message".');
  }
  if (
    params.view === "message" &&
    (!Number.isSafeInteger(params.messageIndex) || (params.messageIndex ?? -1) < 0)
  ) {
    throw new Error('view: "message" requires a non-negative integer messageIndex.');
  }
}

/** List local replays or fetch one bounded replay view. */
export function executeReviewAudit(store: LocalReviewAuditStore) {
  return async (_toolCallId: string, rawParams: unknown, signal?: AbortSignal) => {
    if (!Value.Check(reviewAuditSpec.parameters, rawParams)) {
      throw new Error("Invalid review audit input.");
    }
    const params = rawParams as ReviewAuditParams;
    validateAuditCombination(params);
    if (!params.artifactId) {
      const audits = await store.list(signal);
      return buildAuditListResult(audits, params, signal);
    }
    const raw = await store.read(params.artifactId, signal);
    if (raw === undefined) {
      throw new Error(`Reviewer replay ${params.artifactId} was not found or has expired.`);
    }
    const view = params.view ?? "outline";
    if (view === "raw") return buildAuditRawResult(params.artifactId, raw, params);
    const record = parseReviewAuditRecord(raw);
    if (view === "message") {
      const messageIndex = params.messageIndex as number;
      const text = serializeReplayMessage(record, messageIndex);
      return buildAuditMessageResult(params.artifactId, messageIndex, text, params);
    }
    return buildAuditOutlineResult(params.artifactId, record.messages, params);
  };
}
