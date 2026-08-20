import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { LocalReviewAuditStore } from "../../audit/local-review-audit-store.ts";
import { executeReviewAudit } from "./execute.ts";
import { promptGuidelines, promptSnippet, toolDescription } from "./guidance.ts";
import { renderAuditCall, renderAuditResult } from "./render.ts";
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
    execute: executeReviewAudit(store),
  });
}
