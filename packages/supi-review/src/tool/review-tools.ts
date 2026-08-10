import { defineTool } from "@earendil-works/pi-coding-agent";
import { Value } from "typebox/value";
import { normalizeReviewSubmission } from "../review-result.ts";
import type { ReviewSubmission } from "../types.ts";
import { REVIEW_TOOL_SPECS } from "./tool-specs.ts";

/** Build the fixed structured delivery tool retained for one Reviewer Session. */
export function createReviewSubmissionTool(submission: { value?: ReviewSubmission }) {
  const spec = REVIEW_TOOL_SPECS.submitReview;
  return defineTool({
    ...spec,
    execute: async (_id, args) => {
      if (!Value.Check(spec.parameters, args)) throw new Error("Invalid review submission.");
      const { verdict: _, ...normalized } = normalizeReviewSubmission(
        args as Parameters<typeof normalizeReviewSubmission>[0],
      );
      submission.value = normalized;
      return {
        content: [{ type: "text" as const, text: "Review submitted." }],
        details: normalized,
        terminate: true,
      };
    },
  });
}
