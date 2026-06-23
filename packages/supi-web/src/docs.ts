/**
 * SuPi Web Context7 extension — registers web_docs_search and web_docs_fetch tools.
 *
 * API key is read automatically from the CONTEXT7_API_KEY environment variable.
 */

import type {
  AgentToolResult,
  AgentToolUpdateCallback,
  ExtensionAPI,
  ExtensionContext,
  TruncationResult,
} from "@earendil-works/pi-coding-agent";
import { getContext, searchLibrary } from "./context7-client.ts";
import { getWebToolPromptSurface } from "./tool/guidance.ts";
import { limitModelVisibleOutput } from "./tool/output.ts";
import {
  getWebToolSpec,
  WEB_DOCS_FETCH_TOOL_NAME,
  WEB_DOCS_SEARCH_TOOL_NAME,
  type WebDocsFetchInput,
  type WebDocsSearchInput,
} from "./tool/tool-specs.ts";

interface SearchDetails extends Record<string, unknown> {
  count: number;
  libraryName: string;
  truncation?: TruncationResult;
  fullOutputPath?: string;
}

interface FetchDetails extends Record<string, unknown> {
  libraryId: string;
  raw: boolean;
  truncation?: TruncationResult;
  fullOutputPath?: string;
}

export default function docsExtension(pi: ExtensionAPI): void {
  const searchSpec = getWebToolSpec(WEB_DOCS_SEARCH_TOOL_NAME);
  const searchSurface = getWebToolPromptSurface(WEB_DOCS_SEARCH_TOOL_NAME);
  pi.registerTool({
    name: searchSpec.name,
    label: searchSpec.label,
    description: searchSurface.description,
    promptSnippet: searchSurface.promptSnippet,
    promptGuidelines: searchSurface.promptGuidelines,
    parameters: searchSpec.parameters,
    execute: runSearch,
  });

  const fetchSpec = getWebToolSpec(WEB_DOCS_FETCH_TOOL_NAME);
  const fetchSurface = getWebToolPromptSurface(WEB_DOCS_FETCH_TOOL_NAME);
  pi.registerTool({
    name: fetchSpec.name,
    label: fetchSpec.label,
    description: fetchSurface.description,
    promptSnippet: fetchSurface.promptSnippet,
    promptGuidelines: fetchSurface.promptGuidelines,
    parameters: fetchSpec.parameters,
    execute: runFetch,
  });
}

// biome-ignore lint/complexity/useMaxParams: pi ToolDefinition.execute signature
async function runSearch(
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
    return {
      content: [
        {
          type: "text",
          text: `No libraries found for "${libraryName}". Try a different search term.`,
        },
      ],
      details: { count: 0, libraryName },
    };
  }

  const markdown = formatSearchResults(libraryName, results);
  const output = await limitModelVisibleOutput(markdown, {
    tempPrefix: "web-docs-search",
    suffix: ".md",
  });

  return {
    content: [{ type: "text", text: output.text }],
    details: {
      count: results.length,
      libraryName,
      truncation: output.truncation,
      fullOutputPath: output.fullOutputPath,
    },
  };
}

// biome-ignore lint/complexity/useMaxParams: pi ToolDefinition.execute signature
async function runFetch(
  _toolCallId: string,
  params: unknown,
  signal: AbortSignal | undefined,
  onUpdate: AgentToolUpdateCallback<Record<string, unknown>> | undefined,
  _ctx: ExtensionContext,
): Promise<AgentToolResult<FetchDetails>> {
  const input = (params ?? {}) as WebDocsFetchInput;
  const libraryId = input.library_id?.trim();
  const query = input.query?.trim();
  const raw = Boolean(input.raw);

  if (!libraryId) throw new Error("'library_id' parameter is required");
  if (!query) throw new Error("'query' parameter is required");

  onUpdate?.({
    content: [{ type: "text", text: `Fetching Context7 docs for ${libraryId}...` }],
    details: { libraryId, raw },
  });

  const requestOptions = signal ? { signal } : undefined;
  const content = await getContext(query, libraryId, raw, requestOptions);
  const textContent = typeof content === "string" ? content : JSON.stringify(content, null, 2);
  const output = await limitModelVisibleOutput(textContent, {
    tempPrefix: "web-docs-fetch",
    suffix: raw ? ".json" : ".md",
  });

  return {
    content: [{ type: "text", text: output.text }],
    details: {
      libraryId,
      raw,
      truncation: output.truncation,
      fullOutputPath: output.fullOutputPath,
    },
  };
}

function formatSearchResults(
  libraryName: string,
  results: Awaited<ReturnType<typeof searchLibrary>>,
): string {
  const rows = results.map(
    (lib) =>
      `| **${escapeMd(lib.name)}** | \`${escapeMd(lib.id)}\` | ${escapeMd(lib.description ?? "")} | ${lib.trustScore ?? ""} | ${lib.benchmarkScore ?? ""} | ${lib.totalSnippets ?? ""} | ${lib.versions ? lib.versions.join(", ") : ""} |`,
  );

  return [
    `Found **${results.length}** library/libraries matching "${libraryName}":`,
    "",
    "| Name | ID | Description | Trust | Benchmark | Snippets | Versions |",
    "|---|---|---|---|---|---|---|",
    ...rows,
    "",
    "> Use `web_docs_fetch` with the library ID to retrieve documentation.",
  ].join("\n");
}

function escapeMd(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\n/g, " ");
}
