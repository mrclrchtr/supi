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
    lines.push(...formatBreakdown(snapshot.breakdown, theme));
  } else if (snapshot.findings && snapshot.findings.length > 0) {
    lines.push(...formatFindings(snapshot.findings, snapshot.pattern, theme));
  } else {
    lines.push(theme.fg("dim", "No regressions found in the queried period."));
  }

  return lines;
}

function formatBreakdown(breakdown: CauseBreakdown, theme: Theme): string[] {
  const lines: string[] = [];
  const entries = Object.entries(breakdown) as [string, number][];
  const maxKeyLen = Math.max(...entries.map(([k]) => k.length));

  for (const [cause, count] of entries) {
    const label = cause.padEnd(maxKeyLen);
    const bar = "█".repeat(Math.min(count, 20));
    lines.push(`${label}  ${String(count).padStart(3)}  ${theme.fg("accent", bar)}`);
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
