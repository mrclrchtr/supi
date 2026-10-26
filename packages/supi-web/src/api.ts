/**
 * SuPi Web extension — public API exports.
 */

export type { Context7RequestOptions } from "./context7-client.ts";
export { htmlToMarkdown, wrapAsCodeBlock } from "./convert.ts";
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
  type WebSearchInput,
  type WebToolName,
} from "./tool/tool-specs.ts";
export type { WebDocsFetchOutput } from "./tool/web_docs_fetch/result-schema.ts";
export type { WebDocsSearchOutput } from "./tool/web_docs_search/result-schema.ts";
export type { WebFetchMdOutput } from "./tool/web_fetch_md/result-schema.ts";
export type { WebSearchOutput } from "./tool/web_search/result-schema.ts";
