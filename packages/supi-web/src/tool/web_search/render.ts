import type { Theme } from "@earendil-works/pi-coding-agent";
import { renderCollapsibleTextResult, renderToolCall } from "../render.ts";
import { WEB_SEARCH_TOOL_NAME, type WebSearchInput } from "./spec.ts";

/** Transcript renderer for web_search tool calls. */
export function renderWebSearchCall(args: unknown, theme: Theme) {
  const input = (args ?? {}) as Partial<WebSearchInput>;
  const query = typeof input.query === "string" ? truncatePreview(input.query) : "";
  const freshness = typeof input.freshness === "string" ? input.freshness : undefined;
  return renderToolCall(WEB_SEARCH_TOOL_NAME, query, theme, freshness);
}

/** Transcript renderer for web_search tool results. */
export function renderWebSearchResult(
  result: { content: Array<{ type: string; text?: string }>; details?: unknown },
  { expanded, isPartial }: { expanded: boolean; isPartial: boolean },
  theme: Theme,
  context: { isError?: boolean } = {},
) {
  if (isPartial) {
    return renderCollapsibleTextResult({
      summary: theme.fg("warning", "Searching the web..."),
      expanded,
      theme,
    });
  }

  if (context.isError) {
    return renderCollapsibleTextResult({
      summary: theme.fg("error", "Web search failed"),
      expanded,
      theme,
    });
  }

  const details = readSearchDetails(result.details);
  const summary = buildSearchSummary(details, theme);
  const content = result.content.find((item) => item.type === "text");
  const body =
    details?.sourceCount === 0 ? undefined : content?.type === "text" ? content.text : undefined;

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

interface RenderSearchDetails {
  sourceCount: number;
  truncated: boolean;
  fullOutputPath?: string;
}

function readSearchDetails(value: unknown): RenderSearchDetails | undefined {
  if (!isRecord(value)) return undefined;
  const sourceCount = value.sourceCount;
  if (typeof sourceCount !== "number" || !Number.isInteger(sourceCount) || sourceCount < 0) {
    return undefined;
  }

  const truncation = isRecord(value.truncation) ? value.truncation : undefined;
  const fullOutputPath = value.fullOutputPath;
  return {
    sourceCount,
    truncated: truncation?.truncated === true,
    ...(typeof fullOutputPath === "string" && fullOutputPath.length > 0 ? { fullOutputPath } : {}),
  };
}

function buildSearchSummary(
  details: RenderSearchDetails | undefined,
  theme: { fg: (color: "success" | "warning" | "dim", text: string) => string },
): string {
  if (!details) return theme.fg("success", "Web search finished");

  if (details.sourceCount === 0) return theme.fg("warning", "No web search sources found");

  const noun = details.sourceCount === 1 ? "source" : "sources";
  let summary = theme.fg("success", `Found ${details.sourceCount} ${noun}`);
  if (details.truncated) summary += theme.fg("warning", " [truncated]");
  return summary;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
