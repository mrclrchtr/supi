import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import type { PostReviewPolicy } from "../../config.ts";
import type { ReviewArtifactStore } from "../../session/review-artifact-store.ts";
import type { ReviewBatchDetails, ReviewOutputReference } from "../../types.ts";
import { createReviewOutput, MAX_PAGE_CHARACTERS, MAX_PAGE_LINES } from "../output-page.ts";
import { formatReviewBatch } from "./format.ts";
import { withPostReviewInstruction } from "./post-policy.ts";
import type { runReview } from "./workflow.ts";

/** Completed variant of the review_run workflow outcome. */
export type CompletedReviewOutcome = Extract<
  Awaited<ReturnType<typeof runReview>>,
  { kind: "completed" }
>;

export type ReviewRunResultDetails = ReviewBatchDetails & { output: ReviewOutputReference };

const POST_REVIEW_POLICY_CHARACTER_RESERVE = 4_000;
const POST_REVIEW_POLICY_LINE_RESERVE = 32;

/** Store the full batch report and assemble the model-facing review_run result. */
export function buildRunResult(
  artifactStore: ReviewArtifactStore,
  outcome: CompletedReviewOutcome,
  postReviewPolicy: PostReviewPolicy,
): AgentToolResult<ReviewRunResultDetails> {
  const hasFindings = outcome.details.results.some(
    (result) => result.status === "completed" && result.findings.length > 0,
  );
  const output = createReviewOutput(
    artifactStore,
    formatReviewBatch(outcome.details),
    hasFindings
      ? {
          firstPageCharacters: MAX_PAGE_CHARACTERS - POST_REVIEW_POLICY_CHARACTER_RESERVE,
          firstPageLines: MAX_PAGE_LINES - POST_REVIEW_POLICY_LINE_RESERVE,
        }
      : {},
  );
  const text = withPostReviewInstruction(
    output.text,
    postReviewPolicy,
    outcome.details,
    output.reference,
  );
  return {
    content: [{ type: "text", text }],
    details: { ...outcome.details, output: output.reference },
    ...(outcome.usage ? { usage: outcome.usage } : {}),
  };
}
