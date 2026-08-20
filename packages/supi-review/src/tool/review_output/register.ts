import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { ReviewArtifactStore } from "../../session/review-artifact-store.ts";
import { renderOutputCall, renderOutputResult } from "../../tui/paged-output.ts";
import { executeReviewOutput } from "./execute.ts";
import { promptGuidelines, promptSnippet, toolDescription } from "./guidance.ts";
import { reviewOutputSpec } from "./spec.ts";

/** Register resumable retrieval for agent and interactive Review output artifacts. */
export function registerReviewOutputTool(pi: ExtensionAPI, store: ReviewArtifactStore): void {
  pi.registerTool({
    ...reviewOutputSpec,
    description: toolDescription,
    promptSnippet,
    promptGuidelines: [...promptGuidelines],
    renderCall: renderOutputCall,
    renderResult: renderOutputResult,
    execute: executeReviewOutput(store),
  });

  pi.on("session_start", () => store.clear());
  pi.on("session_tree", () => store.clear());
  pi.on("session_shutdown", () => store.clear());
}
