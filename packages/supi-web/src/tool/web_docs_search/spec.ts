import type { Static } from "typebox";
import { Type } from "typebox";

export const WEB_DOCS_SEARCH_TOOL_NAME = "web_docs_search";
export const WEB_DOCS_SEARCH_TOOL_LABEL = "Web Docs Search";

export const webDocsSearchParameters = Type.Object(
  {
    library_name: Type.String({
      description: "Library name (e.g. react, next.js, fastapi)",
    }),
    query: Type.String({
      description: "Task/question for relevance ranking",
    }),
  },
  { additionalProperties: false },
);

export type WebDocsSearchInput = Static<typeof webDocsSearchParameters>;

/** Canonical provider-facing metadata for the web_docs_search tool. */
export const webDocsSearchSpec = {
  name: WEB_DOCS_SEARCH_TOOL_NAME,
  label: WEB_DOCS_SEARCH_TOOL_LABEL,
  parameters: webDocsSearchParameters,
} as const;
