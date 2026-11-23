import { runSearch } from "./execute.ts";
import { webDocsSearchParameters } from "./input.ts";
import { webDocsSearchOutputSchema } from "./result-schema.ts";

export const WEB_DOCS_SEARCH_TOOL_NAME = "web_docs_search";
export const WEB_DOCS_SEARCH_TOOL_LABEL = "Web Docs Search";

/** Canonical provider-facing metadata for the web_docs_search tool. */
export const webDocsSearchSpec = {
  name: WEB_DOCS_SEARCH_TOOL_NAME,
  label: WEB_DOCS_SEARCH_TOOL_LABEL,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  parameters: webDocsSearchParameters,
  outputSchema: webDocsSearchOutputSchema,
  execute: runSearch,
} as const;
