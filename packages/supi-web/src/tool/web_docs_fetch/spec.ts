import { runFetch } from "./execute.ts";
import { webDocsFetchParameters } from "./input.ts";
import { webDocsFetchOutputSchema } from "./result-schema.ts";

export const WEB_DOCS_FETCH_TOOL_NAME = "web_docs_fetch";
export const WEB_DOCS_FETCH_TOOL_LABEL = "Web Docs Fetch";

/** Canonical provider-facing metadata for the web_docs_fetch tool. */
export const webDocsFetchSpec = {
  name: WEB_DOCS_FETCH_TOOL_NAME,
  label: WEB_DOCS_FETCH_TOOL_LABEL,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  parameters: webDocsFetchParameters,
  outputSchema: webDocsFetchOutputSchema,
  execute: runFetch,
} as const;
