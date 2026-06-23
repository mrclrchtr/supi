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

type SearchLibraryResult = Awaited<ReturnType<typeof searchLibrary>>[number];

const MAX_SEARCH_RESULTS = 10;
const MAX_DESCRIPTION_CHARS = 120;
const MAX_VERSION_COUNT = 5;

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
  const visibleResults = results.slice(0, MAX_SEARCH_RESULTS);
  const hiddenCount = results.length - visibleResults.length;
  const rows = visibleResults.map(formatSearchRow);
  const noun = results.length === 1 ? "library" : "libraries";
  const hiddenNote =
    hiddenCount > 0
      ? [`_${hiddenCount} more omitted; refine \`library_name\` or \`query\` if needed._`, ""]
      : [];

  return [
    `Found ${results.length} Context7 ${noun} for "${libraryName}"${hiddenCount > 0 ? `; showing top ${visibleResults.length}` : ""}:`,
    "",
    "| ID | Name | Trust | Bench | Snips | Versions | Description |",
    "|---|---|---|---|---|---|---|",
    ...rows,
    "",
    ...hiddenNote,
    "> Use `web_docs_fetch` with the chosen ID.",
  ].join("\n");
}

function formatSearchRow(lib: SearchLibraryResult): string {
  const cells = [
    `\`${escapeMd(lib.id)}\``,
    escapeMd(lib.name),
    String(lib.trustScore ?? ""),
    String(lib.benchmarkScore ?? ""),
    String(lib.totalSnippets ?? ""),
    escapeMd(formatVersions(lib.versions)),
    escapeMd(truncateCell(lib.description ?? "", MAX_DESCRIPTION_CHARS)),
  ];

  return `| ${cells.join(" | ")} |`;
}

function formatVersions(versions?: string[]): string {
  if (!versions?.length) return "";
  const visibleVersions = versions.slice(0, MAX_VERSION_COUNT);
  const hiddenCount = versions.length - visibleVersions.length;
  return `${visibleVersions.join(", ")}${hiddenCount > 0 ? `, +${hiddenCount}` : ""}`;
}

function truncateCell(text: string, maxChars: number): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= maxChars) return compact;
  return `${compact.slice(0, maxChars - 1).trimEnd()}…`;
}

function escapeMd(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\n/g, " ");
}
