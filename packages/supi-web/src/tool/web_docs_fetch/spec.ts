import type { Static } from "typebox";
import { Type } from "typebox";
import { runFetch } from "./execute.ts";

export const WEB_DOCS_FETCH_TOOL_NAME = "web_docs_fetch";
export const WEB_DOCS_FETCH_TOOL_LABEL = "Web Docs Fetch";

export const webDocsFetchParameters = Type.Object(
  {
    library_id: Type.String({
      description: "Context7 ID (e.g. /facebook/react); search first if unknown",
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

export type WebDocsFetchInput = Static<typeof webDocsFetchParameters>;

/** Canonical provider-facing metadata for the web_docs_fetch tool. */
export const webDocsFetchSpec = {
  name: WEB_DOCS_FETCH_TOOL_NAME,
  label: WEB_DOCS_FETCH_TOOL_LABEL,
  parameters: webDocsFetchParameters,
  execute: runFetch,
} as const;
