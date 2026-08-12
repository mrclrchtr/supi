import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Value } from "typebox/value";
import type { LocalReviewAuditStore } from "../audit/local-review-audit-store.ts";
import { formatReplayOutline, projectReplayOutline } from "../audit/replay-outline.ts";
import { parseReviewAuditRecord, serializeReplayMessage } from "../audit/review-audit-record.ts";
import { renderAuditCall, renderAuditResult } from "../tui/paged-output.ts";
import { modelFacingPage, pageText, type TextPage } from "./output-page.ts";
import { REVIEW_TOOL_SPECS } from "./tool-specs.ts";

interface AuditParams {
  artifactId?: string;
  view?: "outline" | "message" | "raw";
  messageIndex?: number;
  offset?: number;
  limit?: number;
}

function formatAuditList(audits: Awaited<ReturnType<LocalReviewAuditStore["list"]>>): string {
  if (audits.length === 0) return "No non-expired local reviewer replays were found.";
  return [
    "# Local Reviewer Replays",
    "",
    ...audits.map((audit) => `- ${audit.artifactId} (expires ${audit.expiresAt})`),
  ].join("\n");
}

function pageDetails(page: TextPage) {
  return {
    offset: page.offset,
    ...(page.nextOffset === undefined ? {} : { nextOffset: page.nextOffset }),
    totalCharacters: page.totalCharacters,
  };
}

function validateAuditCombination(params: AuditParams): void {
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

async function listResult(
  spec: typeof REVIEW_TOOL_SPECS.audit,
  store: LocalReviewAuditStore,
  params: AuditParams,
  signal?: AbortSignal,
) {
  const audits = await store.list(signal);
  const page = pageText(formatAuditList(audits), params.offset, params.limit);
  const visibleAudits = audits.filter((audit) => {
    signal?.throwIfAborted();
    return page.text.includes(audit.artifactId);
  });
  return {
    content: [{ type: "text" as const, text: modelFacingPage(spec.name, {}, page) }],
    details: {
      kind: "review-audit" as const,
      mode: "list" as const,
      audits: visibleAudits,
      totalAudits: audits.length,
      ...pageDetails(page),
    },
  };
}

async function artifactResult(
  spec: typeof REVIEW_TOOL_SPECS.audit,
  store: LocalReviewAuditStore,
  params: AuditParams & { artifactId: string },
  signal?: AbortSignal,
) {
  const raw = await store.read(params.artifactId, signal);
  if (raw === undefined) {
    throw new Error(`Reviewer replay ${params.artifactId} was not found or has expired.`);
  }
  const view = params.view ?? "outline";
  if (view === "raw") {
    const page = pageText(raw, params.offset, params.limit);
    return {
      content: [
        {
          type: "text" as const,
          text: modelFacingPage(spec.name, { artifactId: params.artifactId, view: "raw" }, page),
        },
      ],
      details: {
        kind: "review-audit" as const,
        mode: "raw" as const,
        artifactId: params.artifactId,
        ...pageDetails(page),
      },
    };
  }

  const record = parseReviewAuditRecord(raw);
  if (view === "message") {
    const messageIndex = params.messageIndex as number;
    const text = serializeReplayMessage(record, messageIndex);
    const page = pageText(text, params.offset, params.limit);
    return {
      content: [
        {
          type: "text" as const,
          text: modelFacingPage(
            spec.name,
            { artifactId: params.artifactId, view: "message", messageIndex },
            page,
          ),
        },
      ],
      details: {
        kind: "review-audit" as const,
        mode: "message" as const,
        artifactId: params.artifactId,
        messageIndex,
        ...pageDetails(page),
      },
    };
  }

  const rows = projectReplayOutline(record.messages);
  const text = formatReplayOutline(rows);
  const page = pageText(text, params.offset, params.limit);
  return {
    content: [
      {
        type: "text" as const,
        text: modelFacingPage(spec.name, { artifactId: params.artifactId, view: "outline" }, page),
      },
    ],
    details: {
      kind: "review-audit" as const,
      mode: "outline" as const,
      artifactId: params.artifactId,
      totalMessages: rows.length,
      messageIndexes: completeOutlineRowIndexes(text, page),
      ...pageDetails(page),
    },
  };
}

/** Register explicit retrieval for opt-in, local-only reviewer replay artifacts. */
export function registerReviewAuditTool(pi: ExtensionAPI, store: LocalReviewAuditStore): void {
  const spec = REVIEW_TOOL_SPECS.audit;
  pi.registerTool({
    ...spec,
    promptGuidelines: [...spec.promptGuidelines],
    renderCall: renderAuditCall,
    renderResult: renderAuditResult,
    async execute(_id, params, signal) {
      if (!Value.Check(spec.parameters, params)) throw new Error("Invalid review audit input.");
      validateAuditCombination(params);
      if (!params.artifactId) return listResult(spec, store, params, signal);
      return artifactResult(spec, store, { ...params, artifactId: params.artifactId }, signal);
    },
  });
}
