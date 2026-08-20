import { runWebFetch } from "./execute.ts";
import { webFetchMdParameters } from "./input.ts";

export {
  WEB_FETCH_INLINE_MAX_CHARS,
  WEB_FETCH_OUTPUT_MODES,
  type WebFetchMdInput,
  type WebFetchOutputMode,
  webFetchMdParameters,
} from "./input.ts";

export const WEB_FETCH_MD_TOOL_NAME = "web_fetch_md";
export const WEB_FETCH_MD_TOOL_LABEL = "Web Fetch";

/** Canonical provider-facing metadata for the web_fetch_md tool. */
export const webFetchMdSpec = {
  name: WEB_FETCH_MD_TOOL_NAME,
  label: WEB_FETCH_MD_TOOL_LABEL,
  parameters: webFetchMdParameters,
  execute: runWebFetch,
} as const;
