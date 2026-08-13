import {
  type ExtensionAPI,
  formatSize,
  keyHint,
  type Theme,
  type ToolRenderResultOptions,
  truncateHead,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import type { DebugEventView } from "@mrclrchtr/supi-core/debug";
import { formatDataLines } from "./format.ts";
import {
  createDebugRenderDetails,
  type DebugRenderDetails,
  type DebugRenderEvent,
  readDebugRenderDetails,
} from "./render-details.ts";

const DEBUG_REPORT_TYPE = "supi-debug-report";
const MAX_RENDER_LINES = 240;
const MAX_RENDER_BYTES = 16 * 1024;

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

/** Render the compact human-facing call header for `supi_debug`. */
export function renderDebugToolCall(args: unknown, theme: Theme): Text {
  const callArgs = formatCallArgs(args);
  let content = theme.fg("toolTitle", "supi_debug");
  if (callArgs) content += ` ${theme.fg("dim", callArgs)}`;
  return new Text(content, 0, 0);
}

function formatLevel(theme: Theme, level: string): string {
  const color =
    level === "error"
      ? "error"
      : level === "warning"
        ? "warning"
        : level === "info"
          ? "accent"
          : "muted";
  return theme.fg(color, level.toUpperCase());
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? String(timestamp) : date.toISOString();
}

function pushEventLines(lines: string[], event: DebugRenderEvent, theme: Theme): void {
  const timestamp = theme.fg("dim", `[${formatTimestamp(event.timestamp)}]`);
  const level = formatLevel(theme, event.level);
  const source = theme.fg("toolTitle", `${event.source}/${event.category}`);

  lines.push(`${timestamp} ${level} ${source}: ${event.message}`);
  if (event.operationId) lines.push(theme.fg("dim", `  operationId: ${event.operationId}`));
  if (event.cwd) lines.push(theme.fg("dim", `  cwd: ${event.cwd}`));
  pushDataLines(lines, "data", event.data, theme);
}

function pushDataLines(lines: string[], label: string, value: unknown, theme: Theme): void {
  const dataLines = formatDataLines(value);
  if (dataLines.length === 0) return;
  if (dataLines.length === 1) {
    lines.push(theme.fg("dim", `  ${label}: ${dataLines[0]}`));
    return;
  }
  lines.push(theme.fg("dim", `  ${label}:`));
  for (const line of dataLines) lines.push(theme.fg("dim", `    ${line}`));
}

function formatTruncation(truncation: DebugRenderDetails["truncation"]): string | undefined {
  if (!truncation?.truncated) return undefined;
  const omittedLines = truncation.totalLines - truncation.outputLines;
  const omittedBytes = truncation.totalBytes - truncation.outputBytes;
  return `Agent output truncated: showing ${truncation.outputLines} of ${truncation.totalLines} lines (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}); ${omittedLines} lines (${formatSize(omittedBytes)}) omitted.`;
}

function buildDetailNotes(details: DebugRenderDetails, theme: Theme): string[] {
  const notes: string[] = [];
  if (details.omittedEventCount > 0) {
    notes.push(
      theme.fg(
        "warning",
        `${details.omittedEventCount} event${details.omittedEventCount === 1 ? "" : "s"} omitted from the transcript view.`,
      ),
    );
  }
  if (details.eventDataTruncated) {
    notes.push(theme.fg("warning", "Some event data was bounded for the transcript view."));
  }
  const truncation = formatTruncation(details.truncation);
  if (truncation) notes.push(theme.fg("warning", truncation));
  if (details.rawDataUnavailable) {
    notes.push(theme.fg("warning", "Raw debug data is not persisted for historical sessions."));
  } else if (details.rawAccessDenied) {
    notes.push(
      theme.fg(
        "warning",
        "Raw debug data was requested but is not enabled in SuPi Debug settings.",
      ),
    );
  }
  return notes;
}

function buildEventLines(details: DebugRenderDetails, theme: Theme): string[] {
  const lines: string[] = [];
  for (const event of details.events) {
    if (lines.length > 0) lines.push("");
    pushEventLines(lines, event, theme);
  }
  if (lines.length === 0) {
    lines.push(
      theme.fg(
        "muted",
        details.emptyReason === "no-persisted-events"
          ? "This session has no persisted debug events."
          : "No matching debug events available.",
      ),
    );
  }
  return lines;
}

function renderExpandedReport(details: DebugRenderDetails, theme: Theme): string {
  const notes = buildDetailNotes(details, theme);
  const noteText = notes.join("\n");
  const noteBytes = new TextEncoder().encode(noteText).byteLength;
  const marker = "[Transcript view truncated: more output omitted.]";
  const markerBytes = new TextEncoder().encode(marker).byteLength;
  const result = truncateHead(buildEventLines(details, theme).join("\n"), {
    maxLines: Math.max(1, MAX_RENDER_LINES - notes.length - 1),
    maxBytes: Math.max(1, MAX_RENDER_BYTES - noteBytes - markerBytes - 2),
  });
  const bodyLines = result.content ? result.content.split("\n") : [];
  if (result.truncated) bodyLines.push(marker);
  return [...bodyLines, ...notes].join("\n");
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

/** Render the compact or expanded result for the `supi_debug` tool. */
export function renderDebugToolResult(
  result: DebugToolResult,
  options: ToolRenderResultOptions,
  theme: Theme,
  context: { isError: boolean },
): Text {
  if (options.isPartial) return renderProgress(result.details, options.expanded, theme);
  if (context.isError) return new Text(theme.fg("error", "supi_debug failed"), 0, 0);

  const details = readDebugRenderDetails(result.details);
  if (!options.expanded) {
    let summary = renderToolSummary(details, theme);
    if (details.eventCount > 0)
      summary += theme.fg("dim", ` ${keyHint("app.tools.expand", "to expand")}`);
    return new Text(summary, 0, 0);
  }

  return new Text(renderExpandedReport(details, theme), 0, 0);
}

function renderEmptyMessage(content: unknown, details: DebugRenderDetails, theme: Theme): Text {
  const text =
    typeof content === "string"
      ? content
      : details.emptyReason === "no-persisted-events"
        ? "This session has no persisted debug events."
        : "No debug events.";
  return new Text(theme.fg("muted", text), 0, 0);
}

function renderCollapsedMessage(details: DebugRenderDetails, theme: Theme): Text {
  const first = details.events[0];
  let summary = `${details.eventCount} event${details.eventCount === 1 ? "" : "s"} — ${first?.source ?? "debug"}/${first?.category ?? "event"}`;
  if (details.eventCount > 1) summary += ` +${details.eventCount - 1} more`;
  if (details.omittedEventCount > 0) summary += ` · ${details.omittedEventCount} omitted`;
  if (details.eventDataTruncated) summary += " · data bounded";
  if (details.truncation?.truncated) summary += " · output truncated";
  if (details.rawDataUnavailable || details.rawAccessDenied) summary += " · raw unavailable";
  return new Text(theme.fg("muted", summary), 0, 0);
}

function renderDebugMessage(
  content: unknown,
  details: DebugRenderDetails,
  expanded: boolean,
  theme: Theme,
): Text {
  if (details.eventCount === 0) return renderEmptyMessage(content, details, theme);
  if (!expanded) return renderCollapsedMessage(details, theme);
  return new Text(renderExpandedReport(details, theme), 0, 0);
}

/** Register the TUI message renderer for supi-debug-report custom messages. */
export function registerDebugMessageRenderer(pi: ExtensionAPI): void {
  pi.registerMessageRenderer(DEBUG_REPORT_TYPE, (message, options, theme) =>
    renderDebugMessage(
      message.content,
      readDebugRenderDetails(message.details),
      options.expanded,
      theme,
    ),
  );
}

/** Create bounded details for a debug report message. */
export function createDebugMessageDetails(
  events: readonly DebugEventView[],
  options: Parameters<typeof createDebugRenderDetails>[1] = {},
): DebugRenderDetails {
  return createDebugRenderDetails(events, options);
}
