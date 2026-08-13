import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
  type TruncationResult,
  truncateHead,
} from "@earendil-works/pi-coding-agent";
import type { DebugEventView } from "@mrclrchtr/supi-core/debug";
import { formatDataLines } from "./format.ts";

const TRUNCATION_RESERVE_LINES = 2;
const TRUNCATION_RESERVE_BYTES = 512;

function pushFormattedData(lines: string[], label: string, value: unknown): void {
  const dataLines = formatDataLines(value);
  if (dataLines.length === 0) return;
  if (dataLines.length === 1) {
    lines.push(`  ${label}: ${dataLines[0]}`);
  } else {
    lines.push(`  ${label}:`);
    for (const line of dataLines) lines.push(`    ${line}`);
  }
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? String(timestamp) : date.toISOString();
}

/** Format debug events for model-facing or command output. */
export function formatDebugEvents(
  events: readonly DebugEventView[],
  rawAccessDenied: boolean,
  rawDataUnavailable = false,
  persistedEventCount?: number,
): string[] {
  if (events.length === 0) {
    return persistedEventCount === 0
      ? [
          "This session has no persisted debug events; sessions recorded before persistence cannot be backfilled.",
        ]
      : ["No matching debug events available."];
  }

  const lines: string[] = [];
  for (const event of events) {
    lines.push(
      `[${formatTimestamp(event.timestamp)}] ${event.level.toUpperCase()} ${event.source}/${event.category}: ${event.message}`,
    );
    if (event.operationId) lines.push(`  operationId: ${event.operationId}`);
    if (event.cwd) lines.push(`  cwd: ${event.cwd}`);
    pushFormattedData(lines, "data", event.data);
    pushFormattedData(lines, "rawData", event.rawData);
  }
  if (rawDataUnavailable) {
    lines.push("", "Raw debug data is not persisted for historical sessions.");
  } else if (rawAccessDenied) {
    lines.push("", "Raw debug data was requested but is not enabled in SuPi Debug settings.");
  }
  return lines;
}

function formatTruncationNote(truncation: TruncationResult): string {
  const omittedLines = truncation.totalLines - truncation.outputLines;
  const omittedBytes = truncation.totalBytes - truncation.outputBytes;
  return `[Output truncated: showing ${truncation.outputLines} of ${truncation.totalLines} lines (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}). ${omittedLines} lines (${formatSize(omittedBytes)}) omitted. Use filters or a smaller limit to narrow results.]`;
}

function appendTruncationNote(content: string, truncation: TruncationResult): string {
  const note = formatTruncationNote(truncation);
  return content.length > 0 ? `${content}\n\n${note}` : note;
}

function reserveTruncationSpace(content: string): TruncationResult {
  const initial = truncateHead(content, {
    maxLines: DEFAULT_MAX_LINES,
    maxBytes: DEFAULT_MAX_BYTES,
  });
  if (!initial.truncated) return initial;

  return truncateHead(content, {
    maxLines: DEFAULT_MAX_LINES - TRUNCATION_RESERVE_LINES,
    maxBytes: DEFAULT_MAX_BYTES - TRUNCATION_RESERVE_BYTES,
  });
}

/** Limit model-visible debug output to PI's standard tool-output bounds. */
export function truncateDebugOutput(content: string): {
  text: string;
  truncation?: TruncationResult;
} {
  const truncation = reserveTruncationSpace(content);
  const text = truncation.truncated
    ? appendTruncationNote(truncation.content, truncation)
    : truncation.content;

  return {
    text,
    truncation: truncation.truncated ? truncation : undefined,
  };
}
