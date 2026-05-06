// Forensics report formatting for the /supi-cache-forensics command.

import type { Theme } from "@mariozechner/pi-coding-agent";
import type { CauseBreakdown, ForensicsFinding } from "../forensics/types.ts";

export interface ForensicsReportSnapshot {
  pattern: string;
  findings?: ForensicsFinding[];
  breakdown?: CauseBreakdown;
  sessionsScanned: number;
  turnsAnalyzed: number;
}

/**
 * Format forensics results as themed lines for the `/supi-cache-forensics` command.
 */
export function formatForensicsReport(snapshot: ForensicsReportSnapshot, theme: Theme): string[] {
  const lines: string[] = [];

  lines.push(theme.fg("accent", `Cache forensics — ${snapshot.pattern}`));
  lines.push(
    theme.fg(
      "dim",
      `${snapshot.sessionsScanned} sessions scanned, ${snapshot.turnsAnalyzed} turns analyzed`,
    ),
  );
  lines.push("");

  if (snapshot.pattern === "breakdown" && snapshot.breakdown) {
    lines.push(
      ...formatBreakdown(
        snapshot.breakdown,
        snapshot.findings ?? [],
        theme,
        snapshot.sessionsScanned,
        snapshot.turnsAnalyzed,
      ),
    );
  } else if (snapshot.findings && snapshot.findings.length > 0) {
    lines.push(...formatFindings(snapshot.findings, snapshot.pattern, theme));
  } else {
    lines.push(theme.fg("dim", "No regressions found in the queried period."));
  }

  return lines;
}

// biome-ignore lint/complexity/useMaxParams: breakdown formatter takes all needed context
function formatBreakdown(
  breakdown: CauseBreakdown,
  findings: ForensicsFinding[],
  theme: Theme,
  sessionsScanned: number,
  turnsAnalyzed: number,
): string[] {
  const lines: string[] = [];
  const entries = Object.entries(breakdown) as [string, number][];

  // Sort by count descending
  entries.sort((a, b) => b[1] - a[1]);

  const total = entries.reduce((sum, [, v]) => sum + v, 0);
  if (total === 0) {
    lines.push(theme.fg("dim", "No regressions found in the queried period."));
    return lines;
  }

  const maxKeyLen = Math.max(...entries.map(([k]) => k.length));
  const maxCount = Math.max(1, ...entries.map(([, v]) => v));

  // Pre-compute avg drop per cause from findings
  const dropByCause = new Map<string, { sum: number; count: number }>();
  for (const f of findings) {
    const key = f.cause.type;
    const entry = dropByCause.get(key) ?? { sum: 0, count: 0 };
    entry.sum += f.drop;
    entry.count++;
    dropByCause.set(key, entry);
  }

  for (const [cause, count] of entries) {
    if (count === 0) continue;
    const label = cause.padEnd(maxKeyLen);
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    const barWidth = Math.max(1, Math.round((count / maxCount) * 20));
    const bar = "█".repeat(barWidth);
    const dropInfo = dropByCause.get(cause);
    const avgDrop = dropInfo ? `  avg ${Math.round(dropInfo.sum / dropInfo.count)}pp drop` : "";
    lines.push(
      `${label} ${String(count).padStart(3)}  ${String(pct).padStart(3)}%  ${theme.fg("accent", bar)}${avgDrop}`,
    );
  }

  // Summary line
  const turnPct = turnsAnalyzed > 0 ? ((total / turnsAnalyzed) * 100).toFixed(1) : "0.0";
  const perSession = sessionsScanned > 0 ? (total / sessionsScanned).toFixed(1) : "0";
  lines.push(theme.fg("dim", "─".repeat(40)));
  lines.push(
    theme.fg(
      "dim",
      `total ${total}  (${turnPct}% of ${turnsAnalyzed} turns, ~${perSession}/session)`,
    ),
  );

  // Idle/unknown clarification
  if (breakdown.idle > 0) {
    const unexplained = breakdown.unknown + breakdown.idle;
    lines.push(
      theme.fg(
        "dim",
        `ℹ idle regressions (${breakdown.idle} of ${unexplained} total unexplained drops) are unknown drops with turn gaps > threshold`,
      ),
    );
  }

  return lines;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: renderer branches by pattern
function formatFindings(findings: ForensicsFinding[], pattern: string, theme: Theme): string[] {
  const lines: string[] = [];

  for (const f of findings) {
    const causeStr = formatCause(f.cause);
    const header = `  Session ${f.sessionId.slice(0, 8)}  Turn ${f.turnIndex}  ${f.drop}pp drop  (${causeStr})`;
    lines.push(theme.fg("warning", header));

    if (f.previousRate !== undefined && f.currentRate !== undefined) {
      lines.push(`    ${f.previousRate}% → ${f.currentRate}%`);
    }

    if (pattern === "correlate" || pattern === "idle") {
      if (f.toolsBefore.length > 0) {
        lines.push(theme.fg("dim", "    Preceding tools:"));
        for (const tool of f.toolsBefore) {
          lines.push(`      • ${tool.toolName} (${tool.paramKeys.join(", ")})`);
        }
      }
    }

    if (f._pathsInvolved && f._pathsInvolved.length > 0) {
      lines.push(theme.fg("dim", "    Files:"));
      for (const p of f._pathsInvolved.slice(0, 5)) {
        lines.push(`      • ${p}`);
      }
    }
  }

  return lines;
}

function formatCause(cause: ForensicsFinding["cause"]): string {
  switch (cause.type) {
    case "compaction":
      return "compaction";
    case "model_change":
      return `model changed${cause.model !== "unknown" ? ` to ${cause.model}` : ""}`;
    case "prompt_change":
      return "prompt changed";
    case "idle":
      return `idle (${cause.idleGapMinutes} min gap)`;
    default:
      return "unknown";
  }
}
