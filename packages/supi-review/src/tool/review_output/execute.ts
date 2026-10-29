import type { Static } from "typebox";
import type { ReviewArtifactStore } from "../../session/review-artifact-store.ts";
import { pageText } from "../output-page.ts";
import { buildOutputPageResult } from "./result.ts";
import type { reviewOutputSpec } from "./spec.ts";

export type ReviewOutputParams = Static<(typeof reviewOutputSpec)["parameters"]>;

/** Read a bounded direct-call page and the complete native report from one stored artifact. */
export function executeReviewOutput(store: ReviewArtifactStore) {
  return async (_toolCallId: string, params: ReviewOutputParams) => {
    const text = store.readReport(params.artifactId);
    if (text === undefined) {
      throw new Error(
        `Review output ${params.artifactId} was not found or has expired from this session.`,
      );
    }
    const page = pageText(text, params.offset, params.limit);
    return buildOutputPageResult(params.artifactId, text, page);
  };
}
