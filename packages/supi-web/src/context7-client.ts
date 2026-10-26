/** Context7 SDK adapter: request policy and SuPi's successful empty-search outcome. */

import { Context7, Context7Error, type Documentation, type Library } from "@upstash/context7-sdk";

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

/** Search libraries; only the provider's explicit no-match response is a successful empty result. */
export async function searchLibrary(
  query: string,
  libraryName: string,
  options: Context7RequestOptions = {},
): Promise<Library[]> {
  try {
    return await createClient().searchLibrary(query, libraryName, options);
  } catch (error) {
    if (
      error instanceof Context7Error &&
      error.status === 404 &&
      error.code === "no_libraries_found"
    ) {
      return [];
    }
    throw error;
  }
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
