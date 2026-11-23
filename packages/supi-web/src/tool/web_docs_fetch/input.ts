import type { Static } from "typebox";
import { Type } from "typebox";

/** Parameter schema for web_docs_fetch. */
export const webDocsFetchParameters = Type.Object(
  {
    libraryId: Type.String({
      description: "Context7 ID, for example /react/react.",
    }),
    query: Type.String({ description: "Specific docs question" }),
    raw: Type.Optional(
      Type.Boolean({
        description: "Return JSON snippets instead of Markdown",
        default: false,
      }),
    ),
  },
  { additionalProperties: false },
);

/** Validated web_docs_fetch input. */
export type WebDocsFetchInput = Static<typeof webDocsFetchParameters>;
