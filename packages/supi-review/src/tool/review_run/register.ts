import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { ReviewArtifactStore } from "../../session/review-artifact-store.ts";
import { makeRunReviewExecute, type RunReviewExecuteOptions } from "./execute.ts";
import { promptGuidelines, promptSnippet, toolDescription } from "./guidance.ts";
import { renderRunCall, renderRunResult } from "./render.ts";
import { reviewRunSpec } from "./spec.ts";

/** Register caller-defined Review execution for agents. */
export function registerReviewRunTool(
  pi: ExtensionAPI,
  artifactStore: ReviewArtifactStore,
  options: Omit<RunReviewExecuteOptions, "events"> = {},
): void {
  pi.registerTool({
    ...reviewRunSpec,
    description: toolDescription,
    promptSnippet,
    promptGuidelines: [...promptGuidelines],
    renderCall: renderRunCall,
    renderResult: renderRunResult,
    execute: makeRunReviewExecute(artifactStore, { ...options, events: pi.events }),
  });
}
