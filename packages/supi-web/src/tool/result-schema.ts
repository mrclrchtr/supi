import { Type } from "typebox";

/** Limits apply to the model-facing text, not the structured payload. */
export const modelOutputSchema = Type.Object({
  truncated: Type.Boolean(),
  fullOutputPath: Type.Optional(Type.String()),
});
