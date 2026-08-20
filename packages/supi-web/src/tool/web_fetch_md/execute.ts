import type {
  AgentToolResult,
  AgentToolUpdateCallback,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { htmlToMarkdown, wrapAsCodeBlock } from "../../convert.ts";
import { fetchWithNegotiation, isValidHttpUrl } from "../../fetch.ts";
import { writeTempFile } from "../../temp-file.ts";
import { limitModelVisibleOutput } from "../result.ts";
import { buildFileResult, buildInlineResult, type WebFetchDetails } from "./result.ts";
import {
  WEB_FETCH_INLINE_MAX_CHARS,
  type WebFetchMdInput,
  type WebFetchOutputMode,
} from "./spec.ts";

// biome-ignore lint/complexity/useMaxParams: pi ToolDefinition.execute signature
export async function runWebFetch(
  _toolCallId: string,
  params: unknown,
  signal: AbortSignal | undefined,
  onUpdate: AgentToolUpdateCallback<Record<string, unknown>> | undefined,
  _ctx: ExtensionContext,
): Promise<AgentToolResult<WebFetchDetails>> {
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

  const result = await fetchWithNegotiation(url, { timeoutMs, signal });
  const markdown = await resolveMarkdown(result, absLinks);
  const lines = markdown.split("\n").length;
  const chars = markdown.length;
  const base = { chars, lines, url: result.url, outputMode };

  if (shouldReturnFile(outputMode, chars)) {
    const filePath = await writeTempFile(markdown, "web-fetch-md", ".md");
    return buildFileResult(base, filePath);
  }

  const output = await limitModelVisibleOutput(markdown, {
    tempPrefix: "web-fetch-md",
    suffix: ".md",
  });
  return buildInlineResult(base, output);
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
