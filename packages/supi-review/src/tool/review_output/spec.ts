import { Type } from "typebox";
import { reviewOutputParameters } from "./input.ts";

export const REVIEW_OUTPUT_TOOL_NAME = "review_output";
export const REVIEW_OUTPUT_TOOL_LABEL = "Read Review Output";

/** Canonical provider-facing metadata for the review_output tool. */
export const reviewOutputSpec = {
  name: REVIEW_OUTPUT_TOOL_NAME,
  label: REVIEW_OUTPUT_TOOL_LABEL,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  parameters: reviewOutputParameters,
  outputSchema: Type.Object(
    {
      artifactId: Type.String(),
      text: Type.String({
        description: "Complete stored report, independent of the direct-call page.",
      }),
      totalCharacters: Type.Integer({ minimum: 0 }),
    },
    { additionalProperties: false },
  ),
} as const;
