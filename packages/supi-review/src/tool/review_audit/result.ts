import { formatReplayOutline, projectReplayOutline } from "../../audit/replay-outline.ts";
import { modelFacingPage, pageText, type TextPage } from "../output-page.ts";
import { REVIEW_AUDIT_TOOL_NAME } from "./spec.ts";

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

function completeOutlineRowIndexes(text: string, page: TextPage): number[] {
  if (text === "[no messages]") return [];
  const starts: Array<{ index: number; start: number; end: number }> = [];
  let start = 0;
  for (const line of text.split("\n")) {
    const match = /^\[(\d+)\]/.exec(line);
    const end = start + line.length;
    if (match) starts.push({ index: Number(match[1]), start, end });
    start = end + 1;
  }
  const pageEnd = page.nextOffset ?? page.totalCharacters;
  return starts
    .filter((row) => row.start >= page.offset && row.end <= pageEnd)
    .map((row) => row.index);
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
    return page.text.includes(audit.artifactId);
  });
  return {
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
  return {
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
      messageIndexes: completeOutlineRowIndexes(text, page),
      ...pageDetails(page),
    },
  };
}
