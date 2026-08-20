import type { AgentToolResult, TruncationResult } from "@earendil-works/pi-coding-agent";
import type { searchLibrary } from "../../context7-client.ts";
import type { ModelVisibleOutput } from "../result.ts";

export interface SearchDetails extends Record<string, unknown> {
  count: number;
  libraryName: string;
  truncation?: TruncationResult;
  fullOutputPath?: string;
}

type SearchLibraryResult = Awaited<ReturnType<typeof searchLibrary>>[number];

const MAX_SEARCH_RESULTS = 10;
const MAX_DESCRIPTION_CHARS = 120;
const MAX_VERSION_COUNT = 5;

/** Assemble the empty-search result. */
export function buildNoResultsResult(libraryName: string): AgentToolResult<SearchDetails> {
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

/** Assemble the model-facing result for one successful search. */
export function buildSearchResult(
  libraryName: string,
  results: Awaited<ReturnType<typeof searchLibrary>>,
  output: ModelVisibleOutput,
): AgentToolResult<SearchDetails> {
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

/** Format search results as compact Markdown for the model. */
export function formatSearchResults(
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
