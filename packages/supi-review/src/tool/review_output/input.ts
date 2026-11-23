import type { Static } from "typebox";
import { Type } from "typebox";
import { pageLimitSchema, pageOffsetSchema } from "../page-schemas.ts";

/** Parameter schema for review_output, shared by its spec and execution. */
export const reviewOutputParameters = Type.Object(
  {
    artifactId: Type.String({
      minLength: 1,
      maxLength: 128,
      description:
        "Opaque current-process id returned by review_run or /supi-review, not a file path.",
    }),
    offset: pageOffsetSchema,
    limit: pageLimitSchema,
  },
  { additionalProperties: false },
);

/** Validated review_output parameters. */
export type ReviewOutputParams = Static<typeof reviewOutputParameters>;
