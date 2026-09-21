import { runWebSearch } from "./execute.ts";
import { webSearchParameters } from "./input.ts";

export {
  type WebSearchInput,
  webSearchParameters,
} from "./input.ts";

export const WEB_SEARCH_TOOL_NAME = "web_search";
export const WEB_SEARCH_TOOL_LABEL = "Web Search";

/** Canonical provider-facing metadata for the web_search tool. */
export const webSearchSpec = {
  name: WEB_SEARCH_TOOL_NAME,
  label: WEB_SEARCH_TOOL_LABEL,
  parameters: webSearchParameters,
  execute: runWebSearch,
} as const;
