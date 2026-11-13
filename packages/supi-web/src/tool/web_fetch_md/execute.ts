import type { AgentToolUpdateCallback, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { loadWebConfig } from "../../config.ts";
import { htmlToMarkdown, wrapAsCodeBlock } from "../../convert.ts";
import { isValidHttpUrl } from "../../fetch.ts";
import { writeTempFile } from "../../temp-file.ts";
import { fetchPage } from "./fetch.ts";
import {
  WEB_FETCH_INLINE_MAX_CHARS,
  type WebFetchMdInput,
  type WebFetchOutputMode,
} from "./input.ts";
import { buildFileResult, buildInlineResult, type WebFetchResult } from "./result.ts";

/**
 * Build web_fetch_md execution. `configCwd` fixes where Web settings (Firecrawl) are read;
 * omitted, settings come from the calling session's cwd.
 */
export function createWebFetchExecute(configCwd?: string) {
  // biome-ignore lint/complexity/useMaxParams: pi ToolDefinition.execute signature
  return (
    _toolCallId: string,
    params: unknown,
    signal: AbortSignal | undefined,
    onUpdate: AgentToolUpdateCallback<Record<string, unknown>> | undefined,
    ctx: ExtensionContext,
  ): Promise<WebFetchResult> => fetchAsMarkdown(params, signal, onUpdate, configCwd ?? ctx.cwd);
}

/** Default web_fetch_md execution reading Web settings from the calling session's cwd. */
export const runWebFetch = createWebFetchExecute();

async function fetchAsMarkdown(
  params: unknown,
  signal: AbortSignal | undefined,
  onUpdate: AgentToolUpdateCallback<Record<string, unknown>> | undefined,
  configCwd: string,
): Promise<WebFetchResult> {
  const input = (params ?? {}) as WebFetchMdInput;
  const url = String(input.url || "").trim();
  if (!isValidHttpUrl(url)) {
    throw new Error(`URL must be http(s): ${url}`);
  }

  const outputMode = input.outputMode ?? "auto";
  const absLinks = input.absLinks ?? true;
  const timeoutMs = typeof input.timeoutMs === "number" ? input.timeoutMs : 30_000;

  onUpdate?.({
    content: [{ type: "text", text: `Fetching ${url}...` }],
    details: { url, outputMode },
  });

  const result = await fetchPage(url, {
    timeoutMs,
    signal,
    fetchMode: input.fetchMode,
    firecrawlEnabled: loadWebConfig(configCwd).firecrawlEnabled,
  });
  const markdown = await resolveMarkdown(result, absLinks);
  const lines = markdown.split("\n").length;
  const chars = markdown.length;
  const base = {
    chars,
    lines,
    url: result.url,
    outputMode,
    ...(result.retrieval ? { retrieval: result.retrieval } : {}),
  };

  if (shouldReturnFile(outputMode, chars)) {
    const filePath = await writeTempFile(markdown, "web-fetch-md", ".md");
    return buildFileResult(base, filePath);
  }

  return buildInlineResult(base, markdown);
}

function shouldReturnFile(outputMode: WebFetchOutputMode, chars: number): boolean {
  return outputMode === "file" || (outputMode === "auto" && chars > WEB_FETCH_INLINE_MAX_CHARS);
}

async function resolveMarkdown(
  result: { isMarkdown: boolean; isPlainText: boolean; text: string; url: string },
  absLinks: boolean,
): Promise<string> {
  if (result.isMarkdown) return result.text;
  if (result.isPlainText) return wrapAsCodeBlock(result.text, result.url);
  return htmlToMarkdown(result.text, result.url, { absLinks });
}
