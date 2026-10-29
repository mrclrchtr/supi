import {
  formatReplayOutline,
  projectReplayOutline,
  type ReplayOutlineRow,
} from "../../audit/replay-outline.ts";
import { modelFacingPage, pageText, type TextPage } from "../output-page.ts";
import { REVIEW_AUDIT_TOOL_NAME } from "./spec.ts";
import type { ReviewAuditOutput } from "./structured.ts";

export interface AuditPageDetails {
  offset: number;
  nextOffset?: number;
  totalCharacters: number;
}

function pageDetails(page: TextPage): AuditPageDetails {
  return {
    offset: page.offset,
    ...(page.nextOffset === undefined ? {} : { nextOffset: page.nextOffset }),
    totalCharacters: page.totalCharacters,
  };
}

function formatAuditList(audits: Array<{ artifactId: string; expiresAt: string }>): string {
  if (audits.length === 0) return "No non-expired local reviewer replays were found.";
  return [
    "# Local Reviewer Replays",
    "",
    ...audits.map((audit) => `- ${audit.artifactId} (expires ${audit.expiresAt})`),
  ].join("\n");
}

function completeOutlineRows(rows: readonly ReplayOutlineRow[], page: TextPage) {
  let start = 0;
  const pageEnd = page.nextOffset ?? page.totalCharacters;
  return rows.filter((row) => {
    const end = start + formatReplayOutline([row]).length;
    const visible = start >= page.offset && end <= pageEnd;
    start = end + 1;
    return visible;
  });
}

/** Assemble the model-facing result listing non-expired local reviewer replays. */
export function buildAuditListResult(
  audits: Array<{ artifactId: string; expiresAt: string }>,
  params: { offset?: number; limit?: number },
  signal?: AbortSignal,
) {
  const page = pageText(formatAuditList(audits), params.offset, params.limit);
  const visibleAudits = audits.filter((audit) => {
    signal?.throwIfAborted();
    return page.body.includes(audit.artifactId);
  });
  return {
    structuredContent: {
      mode: "list",
      audits: visibleAudits.map(({ artifactId, expiresAt }) => ({ artifactId, expiresAt })),
      totalAudits: audits.length,
      text: page.body,
      ...pageDetails(page),
    } satisfies ReviewAuditOutput,
    content: [{ type: "text" as const, text: modelFacingPage(REVIEW_AUDIT_TOOL_NAME, {}, page) }],
    details: {
      kind: "review-audit" as const,
      mode: "list" as const,
      audits: visibleAudits,
      totalAudits: audits.length,
      ...pageDetails(page),
    },
  };
}

/** Assemble the model-facing result for one raw persisted replay page. */
export function buildAuditRawResult(
  artifactId: string,
  raw: string,
  params: { offset?: number; limit?: number },
) {
  const page = pageText(raw, params.offset, params.limit);
  return {
    structuredContent: {
      mode: "raw",
      artifactId,
      text: page.body,
      ...pageDetails(page),
    } satisfies ReviewAuditOutput,
    content: [
      {
        type: "text" as const,
        text: modelFacingPage(REVIEW_AUDIT_TOOL_NAME, { artifactId, view: "raw" }, page),
      },
    ],
    details: {
      kind: "review-audit" as const,
      mode: "raw" as const,
      artifactId,
      ...pageDetails(page),
    },
  };
}

/** Assemble the model-facing result for one serialized replay message page. */
export function buildAuditMessageResult(
  artifactId: string,
  messageIndex: number,
  text: string,
  params: { offset?: number; limit?: number },
) {
  const page = pageText(text, params.offset, params.limit);
  return {
    structuredContent: {
      mode: "message",
      artifactId,
      messageIndex,
      text: page.body,
      ...pageDetails(page),
    } satisfies ReviewAuditOutput,
    content: [
      {
        type: "text" as const,
        text: modelFacingPage(
          REVIEW_AUDIT_TOOL_NAME,
          { artifactId, view: "message", messageIndex },
          page,
        ),
      },
    ],
    details: {
      kind: "review-audit" as const,
      mode: "message" as const,
      artifactId,
      messageIndex,
      ...pageDetails(page),
    },
  };
}

/** Assemble the model-facing result for one bounded Replay Outline page. */
export function buildAuditOutlineResult(
  artifactId: string,
  messages: readonly unknown[],
  params: { offset?: number; limit?: number },
) {
  const rows = projectReplayOutline(messages);
  const text = formatReplayOutline(rows);
  const page = pageText(text, params.offset, params.limit);
  const visibleRows = completeOutlineRows(rows, page);
  const messageIndexes = visibleRows.map((row) => row.index);
  return {
    structuredContent: {
      mode: "outline",
      artifactId,
      rows: visibleRows.map((row) => ({
        ...row,
        contentKinds: [...row.contentKinds],
        toolNames: [...row.toolNames],
      })),
      messageIndexes,
      totalMessages: rows.length,
      text: page.body,
      ...pageDetails(page),
    } satisfies ReviewAuditOutput,
    content: [
      {
        type: "text" as const,
        text: modelFacingPage(REVIEW_AUDIT_TOOL_NAME, { artifactId, view: "outline" }, page),
      },
    ],
    details: {
      kind: "review-audit" as const,
      mode: "outline" as const,
      artifactId,
      totalMessages: rows.length,
      messageIndexes,
      ...pageDetails(page),
    },
  };
}
