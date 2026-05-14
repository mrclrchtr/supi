/**
 * SuPi Web extension — public API exports.
 */

export { htmlToMarkdown, wrapAsCodeBlock } from "./convert.ts";
export { default as docsExtension } from "./docs.ts";
export {
  FetchError,
  type FetchOptions,
  type FetchResult,
  fetchWithNegotiation,
  isValidHttpUrl,
} from "./fetch.ts";
export { default } from "./web.ts";
