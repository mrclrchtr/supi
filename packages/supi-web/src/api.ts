/**
 * SuPi Web extension — public API exports.
 */

export type { Context7RequestOptions } from "./context7-client.ts";
export { htmlToMarkdown, wrapAsCodeBlock } from "./convert.ts";
export { default as docsExtension } from "./docs.ts";
export {
  FetchError,
  type FetchOptions,
  type FetchResult,
  fetchWithNegotiation,
  isValidHttpUrl,
} from "./fetch.ts";
export {
  WEB_FETCH_INLINE_MAX_CHARS,
  WEB_TOOL_NAMES,
  WEB_TOOL_SPECS,
  type WebDocsFetchInput,
  type WebDocsSearchInput,
  type WebFetchMdInput,
  type WebToolName,
} from "./tool/tool-specs.ts";
export { default } from "./web.ts";
