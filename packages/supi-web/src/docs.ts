/**
 * SuPi Web Context7 extension — registers web_docs_search and web_docs_fetch tools.
 *
 * Uses @upstash/context7-sdk for up-to-date library documentation lookups.
 * API key is read automatically from the CONTEXT7_API_KEY environment variable.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { Context7Error, getContext, searchLibrary } from "./context7-client.ts";
import {
  fetchPromptGuidelines,
  fetchPromptSnippet,
  fetchToolDescription,
  searchPromptGuidelines,
  searchPromptSnippet,
  searchToolDescription,
} from "./tool/docs-guidance.ts";

const SEARCH_TOOL_NAME = "web_docs_search";
const SEARCH_TOOL_LABEL = "Web Docs Search";
const FETCH_TOOL_NAME = "web_docs_fetch";
const FETCH_TOOL_LABEL = "Web Docs Fetch";

export default function docsExtension(pi: ExtensionAPI): void {
  pi.registerTool({
    name: SEARCH_TOOL_NAME,
    label: SEARCH_TOOL_LABEL,
    description: searchToolDescription,
    promptSnippet: searchPromptSnippet,
    promptGuidelines: searchPromptGuidelines,
    parameters: Type.Object({
      library_name: Type.String({
        description: "Library name to search for (e.g. react, next.js, fastapi)",
      }),
      query: Type.String({
        description: "What you're trying to do — used for relevance ranking of results",
      }),
    }),
    execute: runSearch,
  });

  pi.registerTool({
    name: FETCH_TOOL_NAME,
    label: FETCH_TOOL_LABEL,
    description: fetchToolDescription,
    promptSnippet: fetchPromptSnippet,
    promptGuidelines: fetchPromptGuidelines,
    parameters: Type.Object({
      library_id: Type.String({
        description:
          "Context7 library ID (e.g. /facebook/react, /vercel/next.js). Find it via web_docs_search.",
      }),
      query: Type.String({
        description: "Specific question about the library",
      }),
      raw: Type.Optional(
        Type.Boolean({
          description:
            "When true, returns JSON-serialized snippet objects instead of plain text Markdown",
          default: false,
        }),
      ),
    }),
    execute: runFetch,
  });
}

// biome-ignore lint/complexity/useMaxParams: pi ToolDefinition.execute signature
async function runSearch(
  _toolCallId: string,
  params: Record<string, unknown>,
  _signal: AbortSignal | undefined,
  _onUpdate: unknown,
  _ctx: unknown,
): Promise<{
  content: { type: "text"; text: string }[];
  details: Record<string, unknown>;
  isError?: boolean;
}> {
  const libraryName = (params.library_name as string | undefined)?.trim();
  const query = (params.query as string | undefined)?.trim();

  if (!libraryName) {
    return {
      content: [{ type: "text", text: "Error: 'library_name' parameter is required" }],
      isError: true,
      details: {},
    };
  }

  if (!query) {
    return {
      content: [{ type: "text", text: "Error: 'query' parameter is required" }],
      isError: true,
      details: {},
    };
  }

  try {
    const results = await searchLibrary(query, libraryName);

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

    const rows = results.map(
      (lib) =>
        `| **${escapeMd(lib.name)}** | \`${escapeMd(lib.id)}\` | ${escapeMd(lib.description ?? "")} | ${lib.trustScore ?? ""} | ${lib.benchmarkScore ?? ""} | ${lib.totalSnippets ?? ""} | ${lib.versions ? lib.versions.join(", ") : ""} |`,
    );

    const markdown = [
      `Found **${results.length}** library/libraries matching "${libraryName}":`,
      "",
      "| Name | ID | Description | Trust | Benchmark | Snippets | Versions |",
      "|---|---|---|---|---|---|---|",
      ...rows,
      "",
      `> Use \`web_docs_fetch\` with the library ID to retrieve documentation.`,
    ].join("\n");

    return {
      content: [{ type: "text", text: markdown }],
      details: { count: results.length, libraryName },
    };
  } catch (err) {
    const message = err instanceof Context7Error ? err.message : `Unexpected error: ${String(err)}`;
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
      details: { libraryName, error: String(err) },
    };
  }
}

// biome-ignore lint/complexity/useMaxParams: pi ToolDefinition.execute signature
async function runFetch(
  _toolCallId: string,
  params: Record<string, unknown>,
  _signal: AbortSignal | undefined,
  _onUpdate: unknown,
  _ctx: unknown,
): Promise<{
  content: { type: "text"; text: string }[];
  details: Record<string, unknown>;
  isError?: boolean;
}> {
  const libraryId = (params.library_id as string | undefined)?.trim();
  const query = (params.query as string | undefined)?.trim();
  const raw = Boolean(params.raw);

  if (!libraryId) {
    return {
      content: [{ type: "text", text: "Error: 'library_id' parameter is required" }],
      isError: true,
      details: {},
    };
  }

  if (!query) {
    return {
      content: [{ type: "text", text: "Error: 'query' parameter is required" }],
      isError: true,
      details: {},
    };
  }

  try {
    const content = await getContext(query, libraryId, raw);
    const textContent = typeof content === "string" ? content : JSON.stringify(content, null, 2);

    return {
      content: [{ type: "text", text: textContent }],
      details: { libraryId, raw },
    };
  } catch (err) {
    const message = err instanceof Context7Error ? err.message : `Unexpected error: ${String(err)}`;
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
      details: { libraryId, error: String(err) },
    };
  }
}

function escapeMd(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\n/g, " ");
}
