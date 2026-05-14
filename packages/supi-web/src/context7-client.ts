/**
 * Context7 API client — thin wrapper around @upstash/context7-sdk.
 *
 * API key is read automatically from CONTEXT7_API_KEY env var by the SDK.
 */

import { Context7, Context7Error } from "@upstash/context7-sdk";

export { Context7Error };

export interface SearchResult {
  id: string;
  name: string;
  description: string;
  totalSnippets: number;
  trustScore: number;
  benchmarkScore: number;
  versions?: string[];
}

export interface DocSnippet {
  title: string;
  content: string;
  source: string;
}

const client = new Context7();

export async function searchLibrary(query: string, libraryName: string): Promise<SearchResult[]> {
  const results = await client.searchLibrary(query, libraryName);
  return results as unknown as SearchResult[];
}

export async function getContext(
  query: string,
  libraryId: string,
  raw?: boolean,
): Promise<string | DocSnippet[]> {
  const options = raw ? ({ type: "json" } as const) : ({ type: "txt" } as const);
  return client.getContext(query, libraryId, options) as Promise<string | DocSnippet[]>;
}
