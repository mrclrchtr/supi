import { reviewAuditParameters } from "./input.ts";
import { reviewAuditOutputSchema } from "./structured.ts";

export const REVIEW_AUDIT_TOOL_NAME = "review_audit";
export const REVIEW_AUDIT_TOOL_LABEL = "Inspect Review Replay";

/** Canonical provider-facing metadata for the review_audit tool. */
export const reviewAuditSpec = {
  name: REVIEW_AUDIT_TOOL_NAME,
  label: REVIEW_AUDIT_TOOL_LABEL,
  // Reading prunes only expired SuPi-owned replay files that no call can return.
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  parameters: reviewAuditParameters,
  outputSchema: reviewAuditOutputSchema,
} as const;
