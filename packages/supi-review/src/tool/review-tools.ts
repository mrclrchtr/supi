import { defineTool } from "@earendil-works/pi-coding-agent";
import { Value } from "typebox/value";
import { normalizeReviewSubmission } from "../review-result.ts";
import type { ReviewSubmission } from "../types.ts";
import { normalizeDeclineReason } from "./review-recovery.ts";
import { REVIEW_TOOL_SPECS } from "./tool-specs.ts";

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
  const spec = REVIEW_TOOL_SPECS.submitReview;
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
  const spec = REVIEW_TOOL_SPECS.declineReviewRecovery;
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
