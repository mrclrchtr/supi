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

// biome-ignore lint/complexity/useMaxParams: pi ToolDefinition.execute signature
export async function runWebFetch(
  _toolCallId: string,
  params: unknown,
  signal: AbortSignal | undefined,
  onUpdate: AgentToolUpdateCallback<Record<string, unknown>> | undefined,
  ctx: ExtensionContext,
): Promise<WebFetchResult> {
  const input = (params ?? {}) as WebFetchMdInput;
  const url = String(input.url || "").trim();
  if (!isValidHttpUrl(url)) {
    throw new Error(`URL must be http(s): ${url}`);
  }

  const outputMode = input.output_mode ?? "auto";
  const absLinks = input.abs_links ?? true;
  const timeoutMs = typeof input.timeout_ms === "number" ? input.timeout_ms : 30_000;

  onUpdate?.({
    content: [{ type: "text", text: `Fetching ${url}...` }],
    details: { url, outputMode },
  });

  const result = await fetchPage(url, {
    timeoutMs,
    signal,
    fetchMode: input.fetch_mode,
    firecrawlEnabled: loadWebConfig(ctx.cwd).firecrawlEnabled,
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
