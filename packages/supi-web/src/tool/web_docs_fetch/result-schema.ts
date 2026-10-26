import { type Static, Type } from "typebox";
import { modelOutputSchema } from "../result-schema.ts";

const context = {
  libraryId: Type.String(),
  chars: Type.Integer({ minimum: 0 }),
  lines: Type.Integer({ minimum: 0 }),
  modelOutput: modelOutputSchema,
};

/** Context7's text payload or parsed snippet data, selected by the existing raw input. */
export const webDocsFetchOutputSchema = Type.Union([
  Type.Object({
    ...context,
    format: Type.Literal("markdown"),
    markdown: Type.String(),
  }),
  Type.Object({
    ...context,
    format: Type.Literal("snippets"),
    snippets: Type.Array(
      Type.Object({
        title: Type.String(),
        content: Type.String(),
        source: Type.String(),
      }),
    ),
  }),
]);

/** Complete documentation payload, unaffected by model-text truncation. */
export type WebDocsFetchOutput = Static<typeof webDocsFetchOutputSchema>;
