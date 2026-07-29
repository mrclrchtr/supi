import { defineTool } from "@earendil-works/pi-coding-agent";
import { normalizeReviewSubmission } from "../review-result.ts";
import type { ReviewSubmission } from "../types.ts";
import { reviewSubmissionSchema } from "./schemas.ts";

/** Build the fixed structured delivery tool retained for one Reviewer Session. */
export function createReviewSubmissionTool(submission: { value?: ReviewSubmission }) {
  return defineTool({
    name: "submit_review",
    label: "Submit Review",
    description: "Submit the final structured result for this review task.",
    parameters: reviewSubmissionSchema,
    execute: async (_id, args) => {
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
