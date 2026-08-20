import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { Value } from "typebox/value";
import type { ReviewSubmission } from "../../types.ts";
import { normalizeDeclineReason } from "./recovery.ts";
import { plannerDraftSchema, reviewSubmissionSchema } from "./schemas.ts";
import { normalizeReviewSubmission } from "./submission.ts";

const declineReviewRecoverySchema = Type.Object(
  {
    reason: Type.String({
      minLength: 1,
      maxLength: 2_000,
      description: "Reason that retained history cannot support a valid structured submission.",
    }),
  },
  { additionalProperties: false },
);

/** Canonical metadata for the child-session tools owned by the review_run workflow. */
export const REVIEW_CHILD_TOOL_SPECS = {
  submitReview: {
    name: "submit_review",
    label: "Submit Review",
    description:
      "Submit the one final structured result for this review task. A successful call ends the Reviewer Session.",
    parameters: reviewSubmissionSchema,
  },
  declineReviewRecovery: {
    name: "decline_review_recovery",
    label: "Decline Review Recovery",
    description:
      "End Submission Recovery without a Task Verdict when retained history cannot support a valid review submission.",
    parameters: declineReviewRecoverySchema,
  },
  submitPlannerDraft: {
    name: "submit_planner_draft",
    label: "Submit Planner Draft",
    description:
      "Submit the one advisory Planner Draft. A successful call ends the Planner Session.",
    parameters: plannerDraftSchema,
  },
} as const;

/** Shared terminal state for the mutually exclusive recovery tools. */
export interface ReviewRecoveryTerminalState {
  choice?: "submitted" | "declined" | "conflict";
  reason?: string;
}

/** Build the fixed structured delivery tool retained for one Reviewer Session. */
export function createReviewSubmissionTool(
  submission: { value?: ReviewSubmission },
  recovery?: ReviewRecoveryTerminalState,
) {
  const spec = REVIEW_CHILD_TOOL_SPECS.submitReview;
  return defineTool({
    ...spec,
    execute: async (_id, args) => {
      if (!Value.Check(spec.parameters, args)) throw new Error("Invalid review submission.");
      const { verdict: _, ...normalized } = normalizeReviewSubmission(
        args as Parameters<typeof normalizeReviewSubmission>[0],
      );
      if (recovery?.choice === "declined" || recovery?.choice === "conflict") {
        recovery.choice = "conflict";
        throw new Error("Submission Recovery already has a terminal choice.");
      }
      if (recovery) recovery.choice = "submitted";
      submission.value = normalized;
      return {
        content: [{ type: "text" as const, text: "Review submitted." }],
        details: normalized,
        terminate: true,
      };
    },
  });
}

/** Build the recovery-only terminal tool that declines structured delivery. */
export function createReviewRecoveryDeclineTool(holder: ReviewRecoveryTerminalState) {
  const spec = REVIEW_CHILD_TOOL_SPECS.declineReviewRecovery;
  return defineTool({
    ...spec,
    execute: async (_id, args) => {
      if (!Value.Check(spec.parameters, args)) throw new Error("Invalid recovery decline.");
      const reason = normalizeDeclineReason(args.reason);
      if (!reason) throw new Error("Recovery decline reason must contain visible text.");
      if (holder.choice === "submitted" || holder.choice === "conflict") {
        holder.choice = "conflict";
        throw new Error("Submission Recovery already has a terminal choice.");
      }
      holder.choice = "declined";
      holder.reason = reason;
      return {
        content: [{ type: "text" as const, text: "Review recovery declined." }],
        details: {},
        terminate: true,
      };
    },
  });
}
