import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Value } from "typebox/value";
import type { LocalReviewAuditStore } from "../audit/local-review-audit-store.ts";
import { renderAuditCall, renderAuditResult } from "../tui/paged-output.ts";
import { modelFacingPage, pageText } from "./output-page.ts";
import { REVIEW_TOOL_SPECS } from "./tool-specs.ts";

function formatAuditList(audits: Awaited<ReturnType<LocalReviewAuditStore["list"]>>): string {
  if (audits.length === 0) return "No non-expired local reviewer replays were found.";
  return [
    "# Local Reviewer Replays",
    "",
    ...audits.map((audit) => `- ${audit.artifactId} (expires ${audit.expiresAt})`),
  ].join("\n");
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
      if (!params.artifactId) {
        const audits = await store.list(signal);
        const page = pageText(formatAuditList(audits), params.offset, params.limit);
        const visibleAudits = audits.filter((audit) => {
          signal?.throwIfAborted();
          return page.text.includes(audit.artifactId);
        });
        return {
          content: [
            {
              type: "text" as const,
              text: modelFacingPage(spec.name, {}, page),
            },
          ],
          details: {
            kind: "review-audit" as const,
            mode: "list" as const,
            audits: visibleAudits,
            totalAudits: audits.length,
            offset: page.offset,
            ...(page.nextOffset === undefined ? {} : { nextOffset: page.nextOffset }),
            totalCharacters: page.totalCharacters,
          },
        };
      }
      const text = await store.read(params.artifactId, signal);
      if (text === undefined) {
        throw new Error(`Reviewer replay ${params.artifactId} was not found or has expired.`);
      }
      const page = pageText(text, params.offset, params.limit);
      return {
        content: [
          {
            type: "text" as const,
            text: modelFacingPage(spec.name, { artifactId: params.artifactId }, page),
          },
        ],
        details: {
          kind: "review-audit" as const,
          mode: "replay" as const,
          artifactId: params.artifactId,
          offset: page.offset,
          ...(page.nextOffset === undefined ? {} : { nextOffset: page.nextOffset }),
          totalCharacters: page.totalCharacters,
        },
      };
    },
  });
}
