// Report formatting for the /supi-cache-history table.

import type { Theme } from "@earendil-works/pi-coding-agent";
import { diffFingerprints } from "../fingerprint.ts";
import { CAUSE_NOTE, type TurnRecord } from "../monitor/state.ts";

/** Snapshot payload persisted in message.details for the report renderer. */
export interface CacheReportSnapshot {
  turns: TurnRecord[];
  cacheSupported: boolean;
}

/**
 * Format the per-turn cache history as themed lines for the `/supi-cache-history` command.
 *
 * Accepts a snapshot of turn records so that rendered messages are stable —
 * they always reflect the data at the time `/supi-cache-history` was invoked, not the
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

  // ── Regression details section ────────────────────────────

  const detailLines = formatRegressionDetails(turns, theme);
  if (detailLines.length > 0) {
    lines.push("");
    lines.push(theme.fg("accent", "Regression details:"));
    lines.push(...detailLines);
  }

  return lines;
}

/**
 * Build a compact regression-detail section for turns with diagnosed causes.
 *
 * Each entry shows the turn index, hit-rate drop (when computable), and
 * fingerprint diff bullet points for prompt_change regressions.
 */
function formatRegressionDetails(turns: TurnRecord[], theme: Theme): string[] {
  const lines: string[] = [];

  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    const prevTurn = i > 0 ? turns[i - 1] : undefined;
    addTurnDetail(lines, turn, prevTurn, theme);
  }

  return lines;
}

function addTurnDetail(
  lines: string[],
  turn: TurnRecord,
  prevTurn: TurnRecord | undefined,
  theme: Theme,
): void {
  const causeLabel = getCauseLabel(turn);
  if (!causeLabel) return;

  const drop = describeDrop(prevTurn, turn);
  const header = drop
    ? `  Turn ${turn.turnIndex}: ${drop} (${causeLabel})`
    : `  Turn ${turn.turnIndex}: (${causeLabel})`;
  lines.push(theme.fg("warning", header));

  addFingerprintBullets(lines, turn, prevTurn);
}

function addFingerprintBullets(
  lines: string[],
  turn: TurnRecord,
  prevTurn: TurnRecord | undefined,
): void {
  if (!isPromptChange(turn)) return;

  const prevFp = prevTurn?.promptFingerprint;
  const currFp = turn.promptFingerprint;
  if (!prevFp || !currFp) return;

  for (const d of diffFingerprints(prevFp, currFp)) {
    lines.push(`    • ${d}`);
  }
}

/** Determine the cause label for a turn, or undefined if it's a regular turn. */
function getCauseLabel(turn: TurnRecord): string | undefined {
  if (turn.cause) {
    switch (turn.cause.type) {
      case "compaction":
        return "compaction";
      case "model_change":
        return "model changed";
      case "prompt_change":
        return "prompt changed";
      case "unknown":
        return "unknown";
    }
  }
  // Fall back to note-based detection for legacy records
  if (turn.note?.startsWith("⚠")) {
    const label = turn.note.replace("⚠ ", "");
    return label;
  }
  return undefined;
}

/** Check if a turn's cause is prompt_change. */
function isPromptChange(turn: TurnRecord): boolean {
  if (turn.cause?.type === "prompt_change") return true;
  return turn.note === CAUSE_NOTE.prompt_change;
}

/**
 * Describe the hit-rate drop between two adjacent turns.
 * Returns "80% → 5%" or undefined when not computable.
 */
function describeDrop(prev: TurnRecord | undefined, curr: TurnRecord): string | undefined {
  if (!prev || prev.hitRate === undefined || curr.hitRate === undefined) {
    return undefined;
  }
  return `${prev.hitRate}% → ${curr.hitRate}%`;
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
