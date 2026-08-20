import type { Theme } from "@earendil-works/pi-coding-agent";
import { renderCollapsibleTextResult, renderToolCall } from "../render.ts";
import type { WebFetchDetails } from "./result.ts";
import { WEB_FETCH_MD_TOOL_NAME, type WebFetchMdInput } from "./spec.ts";

/** Transcript renderer for web_fetch_md tool calls. */
export function renderWebFetchCall(args: unknown, theme: Theme) {
  const input = (args ?? {}) as WebFetchMdInput;
  const url = typeof input.url === "string" ? input.url : "";
  const outputMode = typeof input.output_mode === "string" ? input.output_mode : undefined;
  return renderToolCall(WEB_FETCH_MD_TOOL_NAME, url, theme, outputMode);
}

/** Transcript renderer for web_fetch_md tool results. */
export function renderWebFetchResult(
  result: { content: Array<{ type: string; text?: string }>; details?: unknown },
  { expanded, isPartial }: { expanded: boolean; isPartial: boolean },
  theme: Theme,
) {
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
  const body = details?.filePath ? undefined : content?.type === "text" ? content.text : undefined;

  return renderCollapsibleTextResult({
    summary,
    body,
    expanded,
    theme,
    fullOutputPath: details?.fullOutputPath,
  });
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
