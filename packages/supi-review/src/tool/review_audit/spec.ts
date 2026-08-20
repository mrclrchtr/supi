import { Type } from "typebox";
import { pageLimitSchema, pageOffsetSchema } from "../page-schemas.ts";

export const REVIEW_AUDIT_TOOL_NAME = "review_audit";
export const REVIEW_AUDIT_TOOL_LABEL = "Inspect Review Replay";

const reviewAuditParameters = Type.Object(
  {
    artifactId: Type.Optional(
      Type.String({
        minLength: 1,
        maxLength: 128,
        description:
          "Local replay id returned by an audited review_run task or /supi-review; omit to list replays.",
      }),
    ),
    view: Type.Optional(
      Type.Union([Type.Literal("outline"), Type.Literal("message"), Type.Literal("raw")], {
        description:
          "Artifact view. Omit for Replay Outline; message needs messageIndex; raw returns exact persisted JSON.",
      }),
    ),
    messageIndex: Type.Optional(
      Type.Integer({
        minimum: 0,
        description: "Zero-based persisted message array position; valid only with view: message.",
      }),
    ),
    offset: pageOffsetSchema,
    limit: pageLimitSchema,
  },
  {
    additionalProperties: false,
    description:
      "Omit artifactId to list replays. Artifact access defaults to bounded Replay Outline; select one message or explicit raw JSON when needed.",
  },
);

/** Canonical provider-facing metadata for the review_audit tool. */
export const reviewAuditSpec = {
  name: REVIEW_AUDIT_TOOL_NAME,
  label: REVIEW_AUDIT_TOOL_LABEL,
  parameters: reviewAuditParameters,
} as const;
