import type { Static } from "typebox";
import { Type } from "typebox";

/** Parameter schema for web_docs_search. */
export const webDocsSearchParameters = Type.Object(
  {
    libraryName: Type.String({
      description: "Library name (e.g. react, next.js, fastapi)",
    }),
    query: Type.String({
      description: "Task/question for relevance ranking",
    }),
  },
  { additionalProperties: false },
);

/** Validated web_docs_search input. */
export type WebDocsSearchInput = Static<typeof webDocsSearchParameters>;
