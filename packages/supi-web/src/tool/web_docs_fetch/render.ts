import type { Theme } from "@earendil-works/pi-coding-agent";
import { renderCollapsibleTextResult, renderToolCall } from "../render.ts";
import type { FetchDetails } from "./result.ts";
import { WEB_DOCS_FETCH_TOOL_NAME, type WebDocsFetchInput } from "./spec.ts";

/** Transcript renderer for web_docs_fetch tool calls. */
export function renderFetchCall(args: unknown, theme: Theme) {
  const input = (args ?? {}) as WebDocsFetchInput;
  const libraryId = typeof input.library_id === "string" ? input.library_id : "";
  const query = typeof input.query === "string" ? truncatePreview(input.query) : undefined;
  return renderToolCall(WEB_DOCS_FETCH_TOOL_NAME, libraryId, theme, query);
}

/** Transcript renderer for web_docs_fetch tool results. */
export function renderFetchResult(
  result: { content: Array<{ type: string; text?: string }>; details?: unknown },
  { expanded, isPartial }: { expanded: boolean; isPartial: boolean },
  theme: Theme,
) {
  if (isPartial) {
    return renderCollapsibleTextResult({
      summary: theme.fg("warning", "Fetching Context7 docs..."),
      expanded,
      theme,
    });
  }

  const details = result.details as FetchDetails | undefined;
  const summary = buildFetchSummary(details, theme);
  const content = result.content.find((item) => item.type === "text");
  const body = content?.type === "text" ? content.text : undefined;

  return renderCollapsibleTextResult({
    summary,
    body,
    expanded,
    theme,
    fullOutputPath: details?.fullOutputPath,
  });
}

function truncatePreview(text: string, maxChars = 48): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= maxChars) return compact;
  return `${compact.slice(0, maxChars - 1).trimEnd()}…`;
}

function buildFetchSummary(
  details: FetchDetails | undefined,
  theme: { fg: (color: "success" | "warning" | "dim", text: string) => string },
): string {
  if (!details) {
    return theme.fg("success", "Fetched Context7 docs");
  }

  const format = details.raw ? "raw JSON" : "Markdown";
  let summary = [
    theme.fg("success", `Fetched ${format}`),
    theme.fg(
      "dim",
      ` for ${details.libraryId} (${details.chars.toLocaleString()} chars, ${details.lines.toLocaleString()} lines)`,
    ),
  ].join("");

  if (details.truncation?.truncated) {
    summary += theme.fg("warning", " [truncated]");
  }

  return summary;
}
