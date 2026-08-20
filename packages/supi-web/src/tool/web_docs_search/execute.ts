import type {
  AgentToolResult,
  AgentToolUpdateCallback,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { searchLibrary } from "../../context7-client.ts";
import { limitModelVisibleOutput } from "../result.ts";
import {
  buildNoResultsResult,
  buildSearchResult,
  formatSearchResults,
  type SearchDetails,
} from "./result.ts";
import type { WebDocsSearchInput } from "./spec.ts";

// biome-ignore lint/complexity/useMaxParams: pi ToolDefinition.execute signature
export async function runSearch(
  _toolCallId: string,
  params: unknown,
  signal: AbortSignal | undefined,
  onUpdate: AgentToolUpdateCallback<Record<string, unknown>> | undefined,
  _ctx: ExtensionContext,
): Promise<AgentToolResult<SearchDetails>> {
  const input = (params ?? {}) as WebDocsSearchInput;
  const libraryName = input.library_name?.trim();
  const query = input.query?.trim();

  if (!libraryName) throw new Error("'library_name' parameter is required");
  if (!query) throw new Error("'query' parameter is required");

  onUpdate?.({
    content: [{ type: "text", text: `Searching Context7 for ${libraryName}...` }],
    details: { libraryName },
  });

  const requestOptions = signal ? { signal } : undefined;
  const results = await searchLibrary(query, libraryName, requestOptions);

  if (results.length === 0) {
    return buildNoResultsResult(libraryName);
  }

  const markdown = formatSearchResults(libraryName, results);
  const output = await limitModelVisibleOutput(markdown, {
    tempPrefix: "web-docs-search",
    suffix: ".md",
  });

  return buildSearchResult(libraryName, results, output);
}
