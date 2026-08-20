import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Value } from "typebox/value";
import type { LocalReviewAuditStore } from "../../audit/local-review-audit-store.ts";
import { renderAuditCall, renderAuditResult } from "../../tui/paged-output.ts";
import { executeReviewAudit } from "./execute.ts";
import { promptGuidelines, promptSnippet, toolDescription } from "./guidance.ts";
import { reviewAuditSpec } from "./spec.ts";

/** Register explicit retrieval for opt-in, local-only reviewer replay artifacts. */
export function registerReviewAuditTool(pi: ExtensionAPI, store: LocalReviewAuditStore): void {
  pi.registerTool({
    ...reviewAuditSpec,
    description: toolDescription,
    promptSnippet,
    promptGuidelines: [...promptGuidelines],
    renderCall: renderAuditCall,
    renderResult: renderAuditResult,
    async execute(toolCallId, params, signal) {
      if (!Value.Check(reviewAuditSpec.parameters, params)) {
        throw new Error("Invalid review audit input.");
      }
      return executeReviewAudit(store)(toolCallId, params, signal);
    },
  });
}
