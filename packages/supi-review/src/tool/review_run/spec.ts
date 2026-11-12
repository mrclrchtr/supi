import { runReviewSchema } from "./input-schema.ts";

export const REVIEW_RUN_TOOL_NAME = "review_run";
export const REVIEW_RUN_TOOL_LABEL = "Run Review";

/** Canonical provider-facing metadata for the review_run tool. */
export const reviewRunSpec = {
  name: REVIEW_RUN_TOOL_NAME,
  label: REVIEW_RUN_TOOL_LABEL,
  // Starts model-backed Reviewer Sessions (optionally with Web tools) and may store replays.
  // Reviewers get bash; inspection-only is a protocol, not access control.
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: true,
  },
  parameters: runReviewSchema,
  // Start Reviews only through direct model calls.
  exposure: "model-only",
} as const;
