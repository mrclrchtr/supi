import type { Theme } from "@earendil-works/pi-coding-agent";
import { renderCollapsibleTextResult, renderToolCall } from "../render.ts";
import type { SearchDetails } from "./result.ts";
import { WEB_DOCS_SEARCH_TOOL_NAME, type WebDocsSearchInput } from "./spec.ts";

/** Transcript renderer for web_docs_search tool calls. */
export function renderSearchCall(args: unknown, theme: Theme) {
  const input = (args ?? {}) as WebDocsSearchInput;
  const libraryName = typeof input.library_name === "string" ? input.library_name : "";
  const query = typeof input.query === "string" ? truncatePreview(input.query) : undefined;
  return renderToolCall(WEB_DOCS_SEARCH_TOOL_NAME, libraryName, theme, query);
}

/** Transcript renderer for web_docs_search tool results. */
export function renderSearchResult(
  result: { content: Array<{ type: string; text?: string }>; details?: unknown },
  { expanded, isPartial }: { expanded: boolean; isPartial: boolean },
  theme: Theme,
) {
  if (isPartial) {
    return renderCollapsibleTextResult({
      summary: theme.fg("warning", "Searching Context7..."),
      expanded,
      theme,
    });
  }

  const details = result.details as SearchDetails | undefined;
  const summary = buildSearchSummary(details, theme);
  const content = result.content.find((item) => item.type === "text");
  const body =
    details?.count === 0 ? undefined : content?.type === "text" ? content.text : undefined;

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

function buildSearchSummary(
  details: SearchDetails | undefined,
  theme: { fg: (color: "success" | "warning" | "dim", text: string) => string },
): string {
  if (!details) {
    return theme.fg("success", "Context7 search finished");
  }

  if (details.count === 0) {
    return [
      theme.fg("warning", "No libraries found"),
      theme.fg("dim", ` for ${JSON.stringify(details.libraryName)}`),
    ].join("");
  }

  const noun = details.count === 1 ? "library" : "libraries";
  let summary = [
    theme.fg("success", `Found ${details.count} ${noun}`),
    theme.fg("dim", ` for ${JSON.stringify(details.libraryName)}`),
  ].join("");

  if (details.truncation?.truncated) {
    summary += theme.fg("warning", " [truncated]");
  }

  return summary;
}
