/**
 * SuPi Web extension entry point — registers the `web_fetch_md` tool with pi.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { htmlToMarkdown, wrapAsCodeBlock } from "./convert.ts";
import { FetchError, fetchWithNegotiation, isValidHttpUrl } from "./fetch.ts";
import { writeTempFile } from "./temp-file.ts";

const TOOL_NAME = "web_fetch_md";
const TOOL_LABEL = "Web Fetch";
const INLINE_MAX_CHARS = 15_000;

const TOOL_DESCRIPTION = `Fetch a web page and convert it to clean Markdown for LLM ingestion.

Only accepts real \`http://\` or \`https://\` URLs. If the page is access-controlled (login, paywall, private content), stop and ask the user for an allowed source or exported content.

Output modes:
- \`auto\` (default): returns Markdown inline if ≤${INLINE_MAX_CHARS.toLocaleString()} characters; otherwise writes to a temporary file and returns the path.
- \`inline\`: always returns Markdown inline.
- \`file\`: always writes to a temporary file and returns the path.

Links and images are absolutized by default. Use \`abs_links: false\` to keep them as-is.`;

const PROMPT_SNIPPET =
  "web_fetch_md — fetch a URL and convert it to clean Markdown suitable for LLM ingestion.";

const PROMPT_GUIDELINES = [
  "Use web_fetch_md to fetch web pages and convert them to clean Markdown for LLM ingestion.",
  "Only accept real `http://` or `https://` URLs; stop and ask the user for an allowed source if the page is access-controlled.",
  "Prefer `output_mode: auto` (default) so large pages are written to temp files instead of flooding the context window.",
  "Set `abs_links: false` only when relative links are intentional (e.g., local documentation).",
];

const OutputModeEnum = Type.Union(
  [Type.Literal("auto"), Type.Literal("inline"), Type.Literal("file")],
  { default: "auto", description: "Output mode: auto, inline, or file" },
);

export default function webExtension(pi: ExtensionAPI): void {
  pi.registerTool({
    name: TOOL_NAME,
    label: TOOL_LABEL,
    description: TOOL_DESCRIPTION,
    promptSnippet: PROMPT_SNIPPET,
    promptGuidelines: PROMPT_GUIDELINES,
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
