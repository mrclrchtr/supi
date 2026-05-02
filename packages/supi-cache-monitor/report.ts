// Report formatting for the /supi-cache history table.

import type { Theme } from "@mariozechner/pi-coding-agent";
import type { TurnRecord } from "./state.ts";

/** Snapshot payload persisted in message.details for the report renderer. */
export interface CacheReportSnapshot {
  turns: TurnRecord[];
  cacheSupported: boolean;
}

/**
 * Format the per-turn cache history as themed lines for the `/supi-cache` command.
 *
 * Accepts a snapshot of turn records so that rendered messages are stable —
 * they always reflect the data at the time `/supi-cache` was invoked, not the
 * current live state.
 *
 * Columns: Turn, Input, CacheR, CacheW, Hit%, Note
 */
export function formatCacheReport(snapshot: CacheReportSnapshot, theme: Theme): string[] {
  const { turns } = snapshot;

  if (turns.length === 0) {
    return [theme.fg("dim", "No cache data yet — send a message to start tracking")];
  }

  const lines: string[] = [];

  // Header
  const header = formatRow({
    turn: "Turn",
    input: "Input",
    cacheR: "CacheR",
    cacheW: "CacheW",
    hitPct: "Hit%",
    note: "Note",
  });
  lines.push(theme.fg("dim", header));
  lines.push(theme.fg("dim", "─".repeat(header.length)));

  // Data rows
  for (const turn of turns) {
    const hitStr = turn.hitRate !== undefined ? `${turn.hitRate}%` : "—";
    const noteStr = turn.note ?? "";
    const row = formatRow({
      turn: String(turn.turnIndex),
      input: formatTokenCount(turn.input),
      cacheR: formatTokenCount(turn.cacheRead),
      cacheW: formatTokenCount(turn.cacheWrite),
      hitPct: hitStr,
      note: noteStr,
    });

    // Color the row based on note
    if (noteStr.startsWith("⚠")) {
      lines.push(theme.fg("warning", row));
    } else if (noteStr === "cold start") {
      lines.push(theme.fg("dim", row));
    } else {
      lines.push(row);
    }
  }

  return lines;
}

interface RowData {
  turn: string;
  input: string;
  cacheR: string;
  cacheW: string;
  hitPct: string;
  note: string;
}

function formatRow(row: RowData): string {
  return [
    row.turn.padStart(4),
    row.input.padStart(8),
    row.cacheR.padStart(8),
    row.cacheW.padStart(8),
    row.hitPct.padStart(6),
    row.note ? `  ${row.note}` : "",
  ].join("  ");
}

function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}k`;
  }
  return String(tokens);
}
