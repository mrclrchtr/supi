/**
 * SuPi Web extension entry point — registers the `web_fetch_md` tool with pi.
 */

import type {
  AgentToolResult,
  AgentToolUpdateCallback,
  ExtensionAPI,
  ExtensionContext,
  TruncationResult,
} from "@earendil-works/pi-coding-agent";
import { htmlToMarkdown, wrapAsCodeBlock } from "./convert.ts";
import { fetchWithNegotiation, isValidHttpUrl } from "./fetch.ts";
import { writeTempFile } from "./temp-file.ts";
import { getWebToolPromptSurface } from "./tool/guidance.ts";
import { limitModelVisibleOutput } from "./tool/output.ts";
import { renderCollapsibleTextResult, renderToolCall } from "./tool/render.ts";
import {
  getWebToolSpec,
  WEB_FETCH_INLINE_MAX_CHARS,
  WEB_FETCH_MD_TOOL_NAME,
  type WebFetchMdInput,
  type WebFetchOutputMode,
} from "./tool/tool-specs.ts";

interface WebFetchDetails extends Record<string, unknown> {
  chars: number;
  lines: number;
  url: string;
  outputMode: WebFetchOutputMode;
  filePath?: string;
  truncation?: TruncationResult;
  fullOutputPath?: string;
}

export default function webExtension(pi: ExtensionAPI): void {
  const spec = getWebToolSpec(WEB_FETCH_MD_TOOL_NAME);
  const surface = getWebToolPromptSurface(WEB_FETCH_MD_TOOL_NAME);

  pi.registerTool({
    name: spec.name,
    label: spec.label,
    description: surface.description,
    promptSnippet: surface.promptSnippet,
    promptGuidelines: surface.promptGuidelines,
    parameters: spec.parameters,
    execute: runWebFetch,
    renderCall(args, theme) {
      const input = (args ?? {}) as WebFetchMdInput;
      const url = typeof input.url === "string" ? input.url : "";
      const outputMode = typeof input.output_mode === "string" ? input.output_mode : undefined;
      return renderToolCall(spec.name, url, theme, outputMode);
    },
    renderResult(result, { expanded, isPartial }, theme) {
      if (isPartial) {
        return renderCollapsibleTextResult({
          summary: theme.fg("warning", "Fetching web content..."),
          expanded,
          theme,
        });
      }

      const details = result.details as WebFetchDetails | undefined;
      const summary = buildWebFetchSummary(details, theme);
      const content = result.content.find((item) => item.type === "text");
      const body = details?.filePath
        ? undefined
        : content?.type === "text"
          ? content.text
          : undefined;

      return renderCollapsibleTextResult({
        summary,
        body,
        expanded,
        theme,
        fullOutputPath: details?.fullOutputPath,
      });
    },
  });
}

// biome-ignore lint/complexity/useMaxParams: pi ToolDefinition.execute signature
async function runWebFetch(
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
  const details: WebFetchDetails = { chars, lines, url: result.url, outputMode };

  if (shouldReturnFile(outputMode, chars)) {
    const filePath = await writeTempFile(markdown, "web-fetch-md", ".md");
    return {
      content: [
        {
          type: "text",
          text: `Content written to ${filePath} (${chars.toLocaleString()} chars, ${lines.toLocaleString()} lines). Use the read tool to access it.`,
        },
      ],
      details: { ...details, filePath },
    };
  }

  const output = await limitModelVisibleOutput(markdown, {
    tempPrefix: "web-fetch-md",
    suffix: ".md",
  });

  return {
    content: [{ type: "text", text: output.text }],
    details: {
      ...details,
      truncation: output.truncation,
      fullOutputPath: output.fullOutputPath,
    },
  };
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

function buildWebFetchSummary(
  details: WebFetchDetails | undefined,
  theme: { fg: (color: "success" | "warning" | "dim", text: string) => string },
): string {
  if (!details) {
    return theme.fg("success", "Fetched web content");
  }

  if (details.filePath) {
    return [
      theme.fg("success", "Saved Markdown to "),
      theme.fg("dim", details.filePath),
      theme.fg(
        "dim",
        ` (${details.chars.toLocaleString()} chars, ${details.lines.toLocaleString()} lines)`,
      ),
    ].join("");
  }

  let summary = [
    theme.fg("success", "Fetched Markdown"),
    theme.fg(
      "dim",
      ` (${details.chars.toLocaleString()} chars, ${details.lines.toLocaleString()} lines)`,
    ),
  ].join("");

  if (details.truncation?.truncated) {
    summary += theme.fg("warning", " [truncated]");
  }

  return summary;
}
