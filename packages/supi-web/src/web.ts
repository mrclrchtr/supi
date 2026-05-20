/**
 * SuPi Web extension entry point — registers the `web_fetch_md` tool with pi.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { htmlToMarkdown, wrapAsCodeBlock } from "./convert.ts";
import { FetchError, fetchWithNegotiation, isValidHttpUrl } from "./fetch.ts";
import { writeTempFile } from "./temp-file.ts";
import { buildPromptGuidelines, promptSnippet, toolDescription } from "./tool/guidance.ts";

const TOOL_NAME = "web_fetch_md";
const TOOL_LABEL = "Web Fetch";
const INLINE_MAX_CHARS = 15_000;

const OutputModeEnum = Type.Union(
  [Type.Literal("auto"), Type.Literal("inline"), Type.Literal("file")],
  { default: "auto", description: "Output mode: auto, inline, or file" },
);

export default function webExtension(pi: ExtensionAPI): void {
  pi.registerTool({
    name: TOOL_NAME,
    label: TOOL_LABEL,
    description: toolDescription,
    promptSnippet,
    promptGuidelines: buildPromptGuidelines(),
    parameters: Type.Object({
      url: Type.String({ description: "http(s) URL to fetch" }),
      output_mode: Type.Optional(OutputModeEnum),
      abs_links: Type.Optional(
        Type.Boolean({ description: "Absolutize relative links/images", default: true }),
      ),
      timeout_ms: Type.Optional(
        Type.Number({ description: "Fetch timeout in milliseconds", default: 30_000 }),
      ),
    }),
    execute: runWebFetch,
  });
}

// biome-ignore lint/complexity/useMaxParams: pi ToolDefinition.execute signature
async function runWebFetch(
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
  const url = String(params.url || "").trim();
  if (!isValidHttpUrl(url)) {
    return {
      content: [{ type: "text", text: `Error: URL must be http(s): ${url}` }],
      isError: true,
      details: { invalidUrl: url },
    } as const;
  }

  const outputMode = (params.output_mode as "auto" | "inline" | "file" | undefined) ?? "auto";
  const absLinks = (params.abs_links as boolean | undefined) ?? true;
  const timeoutMs = typeof params.timeout_ms === "number" ? params.timeout_ms : 30_000;

  try {
    const result = await fetchWithNegotiation(url, { timeoutMs });
    const markdown = await resolveMarkdown(result, absLinks);
    const lines = markdown.split("\n").length;
    const chars = markdown.length;

    const useFile = outputMode === "file" || (outputMode === "auto" && chars > INLINE_MAX_CHARS);

    if (useFile) {
      const filePath = await writeTempFile(markdown, "web-fetch-md", ".md");
      return {
        content: [
          {
            type: "text",
            text: `Content written to ${filePath} (${chars.toLocaleString()} chars, ${lines.toLocaleString()} lines). Use the read tool to access it.`,
          },
        ],
        details: { filePath, chars, lines, url: result.url },
      };
    }

    return {
      content: [{ type: "text", text: markdown }],
      details: { chars, lines, url: result.url },
    };
  } catch (err) {
    const message = err instanceof FetchError ? err.message : `Unexpected error: ${String(err)}`;
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
      details: { url, error: String(err) },
    };
  }
}

async function resolveMarkdown(
  result: { isMarkdown: boolean; isPlainText: boolean; text: string; url: string },
  absLinks: boolean,
): Promise<string> {
  if (result.isMarkdown) return result.text;
  if (result.isPlainText) return wrapAsCodeBlock(result.text, result.url);
  return htmlToMarkdown(result.text, result.url, { absLinks });
}
