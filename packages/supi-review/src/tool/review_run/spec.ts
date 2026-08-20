import { runReviewSchema } from "./input-schema.ts";

export const REVIEW_RUN_TOOL_NAME = "review_run";
export const REVIEW_RUN_TOOL_LABEL = "Run Review";

/** Canonical provider-facing metadata for the review_run tool. */
export const reviewRunSpec = {
  name: REVIEW_RUN_TOOL_NAME,
  label: REVIEW_RUN_TOOL_LABEL,
  parameters: runReviewSchema,
} as const;
