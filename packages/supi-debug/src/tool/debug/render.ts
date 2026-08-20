/** Transcript renderers for the debug tool. */

import { keyHint, type Theme, type ToolRenderResultOptions } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { type DebugRenderDetails, readDebugRenderDetails } from "../../render-details.ts";
import { renderExpandedReport } from "../../renderer.ts";

interface DebugToolResult {
  content?: Array<{ type: string; text?: string }>;
  details?: unknown;
}

interface DebugCallArgs {
  operationId?: unknown;
  source?: unknown;
  level?: unknown;
  category?: unknown;
  limit?: unknown;
  sessionFile?: unknown;
  includeRaw?: unknown;
}

function boundedCallValue(value: unknown, maxLength = 80): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const text = String(value);
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function formatCallArgs(args: unknown): string {
  const input = (args ?? {}) as DebugCallArgs;
  const filters: string[] = [];
  const operationId = boundedCallValue(input.operationId);
  const source = boundedCallValue(input.source);
  const level = boundedCallValue(input.level);
  const category = boundedCallValue(input.category);
  const limit = boundedCallValue(input.limit);
  const sessionFile = boundedCallValue(input.sessionFile);

  if (operationId) filters.push(`operationId=${operationId}`);
  if (source) filters.push(`source=${source}`);
  if (level) filters.push(`level=${level}`);
  if (category) filters.push(`category=${category}`);
  if (limit) filters.push(`limit=${limit}`);
  if (sessionFile) filters.push(`sessionFile=${sessionFile}`);
  if (input.includeRaw === true) filters.push("raw");
  return filters.join(" ");
}
/** Render the compact human-facing call header for `debug`. */
export function renderDebugToolCall(args: unknown, theme: Theme): Text {
  const callArgs = formatCallArgs(args);
  let content = theme.fg("toolTitle", "debug");
  if (callArgs) content += ` ${theme.fg("dim", callArgs)}`;
  return new Text(content, 0, 0);
}

function renderToolSummary(details: DebugRenderDetails, theme: Theme): string {
  if (details.eventCount === 0) {
    return details.emptyReason === "no-persisted-events"
      ? theme.fg("muted", "No persisted debug events")
      : theme.fg("muted", "No matching debug events");
  }

  let summary = `${details.eventCount} event${details.eventCount === 1 ? "" : "s"}`;
  if (details.omittedEventCount > 0) summary += ` · ${details.omittedEventCount} omitted`;
  if (details.eventDataTruncated) summary += " · data bounded";
  if (details.truncation?.truncated) summary += " · output truncated";
  if (details.rawDataUnavailable || details.rawAccessDenied) summary += " · raw unavailable";
  return theme.fg("muted", summary);
}

function renderProgress(details: unknown, expanded: boolean, theme: Theme): Text {
  const progress =
    typeof details === "object" && details !== null ? (details as Record<string, unknown>) : {};
  const scannedLines =
    typeof progress.scannedLines === "number" ? progress.scannedLines.toLocaleString("en-US") : "?";
  const matchedEvents =
    typeof progress.matchedEvents === "number"
      ? progress.matchedEvents.toLocaleString("en-US")
      : "?";
  const line = `Reading persisted debug events… ${scannedLines} lines scanned · ${matchedEvents} matches`;
  return new Text(theme.fg("warning", expanded ? line : "Reading persisted debug events…"), 0, 0);
}

/** Render the compact or expanded result for the `debug` tool. */

/** Render the compact or expanded result for the `debug` tool. */
export function renderDebugToolResult(
  result: DebugToolResult,
  options: ToolRenderResultOptions,
  theme: Theme,
  context: { isError: boolean },
): Text {
  if (options.isPartial) return renderProgress(result.details, options.expanded, theme);
  if (context.isError) return new Text(theme.fg("error", "debug failed"), 0, 0);

  const details = readDebugRenderDetails(result.details);
  if (!options.expanded) {
    let summary = renderToolSummary(details, theme);
    if (details.eventCount > 0)
      summary += theme.fg("dim", ` ${keyHint("app.tools.expand", "to expand")}`);
    return new Text(summary, 0, 0);
  }

  return new Text(renderExpandedReport(details, theme), 0, 0);
}
