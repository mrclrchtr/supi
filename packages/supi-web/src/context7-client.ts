/** Context7 SDK adapter: single-attempt request policy over the official SDK. */

import { Context7, type Documentation, type Library } from "@upstash/context7-sdk";

export type { Documentation as DocSnippet, Library as SearchResult } from "@upstash/context7-sdk";
export { Context7Error } from "@upstash/context7-sdk";

/** Request options shared by Context7 calls. */
export interface Context7RequestOptions {
  signal?: AbortSignal;
}

function createClient(): Context7 {
  // Resolve credentials per call, never during extension loading. Preserve single-attempt,
  // signal-driven requests rather than inheriting the SDK's retries and timeout.
  return new Context7({ retry: false, timeout: false });
}

/** Search libraries; the SDK returns every HTTP 404 as a successful empty result. */
export async function searchLibrary(
  query: string,
  libraryName: string,
  options: Context7RequestOptions = {},
): Promise<Library[]> {
  return createClient().searchLibrary(query, libraryName, options);
}

/** Fetch text or SDK-normalized JSON snippets, preserving code and information snippets. */
export async function getContext(
  query: string,
  libraryId: string,
  raw?: boolean,
  options: Context7RequestOptions = {},
): Promise<string | Documentation[]> {
  return createClient().getContext(query, libraryId, {
    ...options,
    type: raw ? "json" : "txt",
  });
}
