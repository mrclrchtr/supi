import type { AgentToolResult, TruncationResult } from "@earendil-works/pi-coding-agent";
import { limitModelVisibleOutput, modelOutputMetadata } from "../result.ts";
import type { WebFetchOutputMode } from "./input.ts";
import type { FirecrawlRetrieval, WebFetchMdOutput } from "./result-schema.ts";

/** Final fetch result requires both native representations. */
export type WebFetchResult = AgentToolResult<WebFetchDetails> & {
  structuredContent: WebFetchMdOutput;
};

export interface WebFetchDetails extends Record<string, unknown> {
  chars: number;
  lines: number;
  url: string;
  outputMode: WebFetchOutputMode;
  retrieval?: FirecrawlRetrieval;
  filePath?: string;
  truncation?: TruncationResult;
  fullOutputPath?: string;
}

/** Common result metrics shared by both fetch result modes. */
export interface WebFetchResultBase {
  chars: number;
  lines: number;
  url: string;
  outputMode: WebFetchOutputMode;
  retrieval?: FirecrawlRetrieval;
}

/** Assemble the file-mode result for one fetch. */
export function buildFileResult(base: WebFetchResultBase, filePath: string): WebFetchResult {
  return {
    content: [
      {
        type: "text",
        text: `${retrievalNotice(base)}Content written to ${filePath} (${base.chars.toLocaleString()} chars, ${base.lines.toLocaleString()} lines). Use the read tool to access it.`,
      },
    ],
    structuredContent: {
      mode: "file",
      url: base.url,
      chars: base.chars,
      lines: base.lines,
      filePath,
      ...(base.retrieval ? { retrieval: base.retrieval } : {}),
    },
    details: { ...base, filePath },
  };
}

/** Assemble the inline-mode result for one fetch. */
export async function buildInlineResult(
  base: WebFetchResultBase,
  markdown: string,
): Promise<WebFetchResult> {
  const output = await limitModelVisibleOutput(retrievalNotice(base) + markdown, {
    tempPrefix: "web-fetch-md",
    suffix: ".md",
  });
  return {
    content: [{ type: "text", text: output.text }],
    structuredContent: {
      mode: "inline",
      url: base.url,
      chars: base.chars,
      lines: base.lines,
      markdown,
      modelOutput: modelOutputMetadata(output),
      ...(base.retrieval ? { retrieval: base.retrieval } : {}),
    },
    details: {
      ...base,
      truncation: output.truncation,
      fullOutputPath: output.fullOutputPath,
    },
  };
}

function retrievalNotice(base: WebFetchResultBase): string {
  if (!base.retrieval) return "";
  const { cacheState, cachedAt } = base.retrieval;
  const cache = cacheState ? `cache: ${cacheState}` : "cache status unknown";
  const timestamp = cachedAt ? `; cached at ${cachedAt}` : "";
  // Provider fields are schema-bounded; shorten URL display without losing the full structured URL.
  const source =
    base.url.length > 1024 ? `${base.url.slice(0, 1024)}… [source URL shortened]` : base.url;
  return `Retrieved via Firecrawl (${cache}${timestamp}). Source: ${source}\n\n`;
}
