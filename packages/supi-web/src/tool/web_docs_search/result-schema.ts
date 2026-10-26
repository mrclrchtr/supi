import { type Static, Type } from "typebox";
import { modelOutputSchema } from "../result-schema.ts";

/** Complete Context7 library matches, independent of the compact table's limits. */
export const webDocsSearchOutputSchema = Type.Object({
  results: Type.Array(
    Type.Object({
      id: Type.String(),
      name: Type.String(),
      description: Type.String(),
      totalSnippets: Type.Number(),
      trustScore: Type.Number(),
      benchmarkScore: Type.Number(),
      versions: Type.Optional(Type.Array(Type.String())),
    }),
  ),
  count: Type.Integer({ minimum: 0 }),
  modelOutput: Type.Object({
    ...modelOutputSchema.properties,
    omittedResults: Type.Integer({
      minimum: 0,
      description: "Matches excluded by the compact table's row limit, before text truncation.",
    }),
  }),
});

/** All API matches, with unshortened descriptions and versions. */
export type WebDocsSearchOutput = Static<typeof webDocsSearchOutputSchema>;
