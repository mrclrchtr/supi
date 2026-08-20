import { Type } from "typebox";
import { pageLimitSchema, pageOffsetSchema } from "../page-schemas.ts";

export const REVIEW_OUTPUT_TOOL_NAME = "review_output";
export const REVIEW_OUTPUT_TOOL_LABEL = "Read Review Output";

const reviewOutputParameters = Type.Object(
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
  {
    additionalProperties: false,
    description: "Read one page of an artifact from an agent or interactive Review.",
  },
);

/** Canonical provider-facing metadata for the review_output tool. */
export const reviewOutputSpec = {
  name: REVIEW_OUTPUT_TOOL_NAME,
  label: REVIEW_OUTPUT_TOOL_LABEL,
  parameters: reviewOutputParameters,
} as const;
