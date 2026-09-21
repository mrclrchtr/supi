import type { AgentToolResult, TruncationResult } from "@earendil-works/pi-coding-agent";
import type { ModelVisibleOutput } from "../result.ts";
import type { WebSearchSource } from "./parse.ts";

/** Human-facing and model-facing facts for one Web Search result. */
export interface WebSearchDetails extends Record<string, unknown> {
  sourceCount: number;
  excerptCount: number;
  truncation?: TruncationResult;
  fullOutputPath?: string;
}

/** Assemble a successful Web Search result. */
export function buildSearchResult(
  sources: WebSearchSource[],
  output: ModelVisibleOutput,
): AgentToolResult<WebSearchDetails> {
  return {
    content: [{ type: "text", text: output.text }],
    details: {
      sourceCount: sources.length,
      excerptCount: sources.reduce((count, source) => count + source.excerpts.length, 0),
      truncation: output.truncation,
      fullOutputPath: output.fullOutputPath,
    },
  };
}

/** Format all provider sources and excerpts as compact Markdown. */
export function formatSearchResults(sources: WebSearchSource[]): string {
  if (sources.length === 0) return "No web search sources found.";

  const lines = ["Source excerpts. Dates are provider-reported publication or modification dates."];
  for (const source of sources) {
    lines.push("", `### [${escapeLinkText(source.title)}](<${escapeUrl(source.url)}>)`);
    if (source.sourceDate) lines.push(`Source date: ${source.sourceDate}`);
    for (const excerpt of source.excerpts) lines.push("", formatExcerpt(excerpt));
  }

  return lines.join("\n");
}

function formatExcerpt(excerpt: string): string {
  const lines = excerpt.split(/\r?\n/);
  return lines.map((line) => `> ${line}`).join("\n");
}

function escapeLinkText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/\r?\n/g, " ");
}

function escapeUrl(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/>/g, "\\>").replace(/\r?\n/g, "");
}
