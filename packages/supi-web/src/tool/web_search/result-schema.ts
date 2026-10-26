import { type Static, Type } from "typebox";
import { modelOutputSchema } from "../result-schema.ts";

/** All validated provider sources; no generated answer or private bx envelope. */
export const webSearchOutputSchema = Type.Object({
  sources: Type.Array(
    Type.Object({
      title: Type.String(),
      url: Type.String(),
      excerpts: Type.Array(Type.String()),
      sourceDate: Type.Optional(
        Type.String({ description: "Provider-reported publication or modification date." }),
      ),
    }),
  ),
  sourceCount: Type.Integer({ minimum: 0 }),
  excerptCount: Type.Integer({ minimum: 0 }),
  modelOutput: modelOutputSchema,
});

/** Source evidence remains complete even when model-facing Markdown is truncated. */
export type WebSearchOutput = Static<typeof webSearchOutputSchema>;
