/**
 * Context7 API client — calls the Context7 REST API directly via fetch(),
 * matching the official Context7 pi extension pattern.
 *
 * API key is read from CONTEXT7_API_KEY env var. Without a key, requests are
 * sent without an Authorization header; the API will return 401.
 */

const BASE_URL = "https://context7.com/api";

export class Context7Error extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Context7Error";
  }
}

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

function authHeaders(): Record<string, string> {
  const apiKey = process.env.CONTEXT7_API_KEY;
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
}

async function parseErrorResponse(response: Response): Promise<string> {
  try {
    const json = (await response.json()) as { message?: string };
    if (json.message) return json.message;
  } catch {
    // JSON parsing failed, fall through to status-based message
  }

  const hasKey = Boolean(process.env.CONTEXT7_API_KEY);
  if (response.status === 429) {
    return hasKey
      ? "Rate limited or quota exceeded. Upgrade your plan at https://context7.com/plans for higher limits."
      : "Rate limited or quota exceeded. Create a free API key at https://context7.com/dashboard for higher limits.";
  }
  if (response.status === 404) {
    return "The library you are trying to access does not exist. Please try with a different library ID.";
  }
  if (response.status === 401) {
    return "Invalid API key. Please check your API key. API keys should start with 'ctx7sk' prefix.";
  }
  return `Request failed with status ${response.status}. Please try again later.`;
}

interface ApiSearchResult {
  id: string;
  title: string;
  description: string;
  totalSnippets: number;
  trustScore: number;
  benchmarkScore: number;
  versions?: string[];
}

interface ApiSearchResponse {
  error?: string;
  results: ApiSearchResult[];
}

function mapSearchResult(r: ApiSearchResult): SearchResult {
  return {
    id: r.id,
    name: r.title,
    description: r.description,
    totalSnippets: r.totalSnippets,
    trustScore: r.trustScore,
    benchmarkScore: r.benchmarkScore,
    versions: r.versions,
  };
}

export async function searchLibrary(query: string, libraryName: string): Promise<SearchResult[]> {
  const url = new URL(`${BASE_URL}/v2/libs/search`);
  url.searchParams.set("query", query);
  url.searchParams.set("libraryName", libraryName);

  const response = await fetch(url, { headers: authHeaders() });

  if (!response.ok) {
    throw new Context7Error(await parseErrorResponse(response));
  }

  const data = (await response.json()) as ApiSearchResponse;
  return (data.results ?? []).map(mapSearchResult);
}

export async function getContext(
  query: string,
  libraryId: string,
  raw?: boolean,
): Promise<string | DocSnippet[]> {
  const url = new URL(`${BASE_URL}/v2/context`);
  url.searchParams.set("query", query);
  url.searchParams.set("libraryId", libraryId);

  const response = await fetch(url, { headers: authHeaders() });

  if (!response.ok) {
    throw new Context7Error(await parseErrorResponse(response));
  }

  if (raw) {
    const json = (await response.json()) as DocSnippet[];
    return json;
  }

  return response.text();
}
