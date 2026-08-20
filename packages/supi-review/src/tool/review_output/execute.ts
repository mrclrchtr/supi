import type { Static } from "typebox";
import type { ReviewArtifactStore } from "../../session/review-artifact-store.ts";
import { buildOutputPageResult } from "./result.ts";
import type { reviewOutputSpec } from "./spec.ts";

export type ReviewOutputParams = Static<(typeof reviewOutputSpec)["parameters"]>;

/** Read one bounded page from a stored Review output artifact. */
export function executeReviewOutput(store: ReviewArtifactStore) {
  return async (_toolCallId: string, params: ReviewOutputParams) => {
    const page = store.read(params.artifactId, params.offset, params.limit);
    if (!page) {
      throw new Error(
        `Review output ${params.artifactId} was not found or has expired from this session.`,
      );
    }
    return buildOutputPageResult(params.artifactId, page);
  };
}
