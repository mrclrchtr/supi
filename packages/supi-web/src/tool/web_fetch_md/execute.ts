import type { AgentToolUpdateCallback, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { loadWebConfig } from "../../config.ts";
import { htmlToMarkdown, wrapAsCodeBlock } from "../../convert.ts";
import { isHtml, isValidHttpUrl } from "../../fetch.ts";
import { writeImageFile, writeTempFile } from "../../temp-file.ts";
import { fetchPage, type PageFetchResult } from "./fetch.ts";
import {
  WEB_FETCH_INLINE_MAX_CHARS,
  type WebFetchMdInput,
  type WebFetchOutputMode,
} from "./input.ts";
import {
  buildFileResult,
  buildImageResult,
  buildInlineResult,
  type WebFetchResult,
} from "./result.ts";

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

  const firecrawlEnabled = loadWebConfig(configCwd).firecrawlEnabled;
  const result = await fetchPage(url, {
    timeoutMs,
    signal,
    fetchMode: input.fetchMode,
    firecrawlEnabled,
  });
  if (result.image) {
    const { data, extension, mediaType } = result.image;
    const filePath = writeImageFile(data, "web-fetch", extension);
    return buildImageResult(
      { chars: 0, lines: 0, url: result.url, outputMode },
      { filePath, mediaType, bytes: data.byteLength },
    );
  }
  const markdown = await resolveMarkdown(result, absLinks);
  const lines = markdown.split("\n").length;
  const chars = markdown.length;
  const notice = contentNotice(result, markdown, firecrawlEnabled);
  const base = {
    chars,
    lines,
    url: result.url,
    outputMode,
    ...(result.retrieval ? { retrieval: result.retrieval } : {}),
    ...(notice ? { notice } : {}),
  };

  if (shouldReturnFile(outputMode, chars)) {
    const filePath = await writeTempFile(markdown, "web-fetch-md", ".md");
    return buildFileResult(base, filePath);
  }

  return buildInlineResult(base, markdown);
}

/** HTML that yields less text than this is reported as probably not the page. */
const SPARSE_HTML_TEXT_CHARS = 100;

/**
 * Explain a successful direct fetch whose content is probably not the page. A bot challenge can
 * answer with an empty 2xx body, and a JavaScript-rendered page yields only its static shell;
 * both otherwise look like a short but valid result. Firecrawl rejects such content itself.
 */
function contentNotice(
  result: PageFetchResult,
  markdown: string,
  firecrawlEnabled: boolean,
): string | undefined {
  if (result.retrieval) return undefined;
  const retry = `Retry with fetchMode: "firecrawl" (${firecrawlEnabled ? "" : "requires Firecrawl enabled in /supi-settings and FIRECRAWL_API_KEY; "}shares the URL and may consume credits) or use another source.`;
  if (!result.text.trim()) {
    const status = result.status === undefined ? "" : ` (HTTP ${result.status})`;
    return `The server returned an empty body${status}; no page content was fetched. ${retry}`;
  }
  const extracted = markdown.trim().length;
  // Only converted HTML can lose its content; short Markdown, text, or JSON is what was served.
  if (result.isMarkdown || result.isPlainText || !isHtml(result.text)) return undefined;
  if (extracted >= SPARSE_HTML_TEXT_CHARS) return undefined;
  return `Only ${extracted.toLocaleString()} characters of text were extracted from ${result.text.length.toLocaleString()} characters of HTML; the page may render its content with JavaScript. ${retry}`;
}

function shouldReturnFile(outputMode: WebFetchOutputMode, chars: number): boolean {
  return outputMode === "file" || (outputMode === "auto" && chars > WEB_FETCH_INLINE_MAX_CHARS);
}

async function resolveMarkdown(
  result: {
    isMarkdown: boolean;
    isPlainText: boolean;
    text: string;
    url: string;
    contentType: string;
  },
  absLinks: boolean,
): Promise<string> {
  if (result.isMarkdown) return result.text;
  if (result.isPlainText) return wrapAsCodeBlock(result.text, result.url, result.contentType);
  return htmlToMarkdown(result.text, result.url, { absLinks, contentType: result.contentType });
}
