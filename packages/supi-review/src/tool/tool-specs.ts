import { Type } from "typebox";
import { runReviewSchema } from "./agent-review-schemas.ts";
import { MAX_PAGE_CHARACTERS, MAX_PAGE_LINES } from "./output-page.ts";
import { plannerDraftSchema, reviewSubmissionSchema } from "./schemas.ts";

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

/** Canonical names and provider-facing metadata for package-owned review-session tools. */
export const REVIEW_TOOL_SPECS = {
  run: {
    name: "review_run",
    label: "Run Review",
    description: `Run one to four independent Inspection-only tasks concurrently against one exact frozen target. Use for code reviews instead of generic subagents. Each change task needs a non-empty change; committed change targets require from; all-state targets omit from. Creates a disposable linked Git worktree. A configured bootstrap can run one shell command there, and enabled auditing stores raw local replays. Output pages are limited to ${MAX_PAGE_CHARACTERS} UTF-16 characters and ${MAX_PAGE_LINES.toLocaleString("en-US")} lines.`,
    promptSnippet: "Run independent inspection-only review tasks",
    promptGuidelines: [
      "Use `review_run` for repository reviews and criteria-based inspections. Use task mode `change` for before-and-after changes and `state` for the frozen current code state.",
      "Do not use `review_run` for exploration.",
      "Do not use `review_run` for simple reviews you can complete directly.",
    ],
    parameters: runReviewSchema,
  },
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
