import type { Static } from "typebox";
import { Type } from "typebox";
import { pageLimitSchema, pageOffsetSchema } from "../page-schemas.ts";

/** Parameter schema for review_audit, shared by its spec and execution. */
export const reviewAuditParameters = Type.Object(
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
      Type.Enum(["outline", "message", "raw"] as const, {
        type: "string",
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
  { additionalProperties: false },
);

/** Validated review_audit parameters. */
export type ReviewAuditParams = Static<typeof reviewAuditParameters>;
