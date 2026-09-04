// Forensics query functions — pure operations on extracted session data.

import type { CauseBreakdown, ForensicsFinding } from "./types.ts";

/**
 * Rank regression turns by hit-rate drop magnitude.
 *
 * Structural events without a measurable drop remain available to breakdown
 * queries, but they are not hotspots. Results are sorted descending by drop.
 */
export function findHotspots(
  findings: ForensicsFinding[],
  minDrop: number = 0,
): ForensicsFinding[] {
  return findings.filter((f) => f.drop > 0 && f.drop >= minDrop).sort((a, b) => b.drop - a.drop);
}

/** Keep the top findings after a query has applied its own filtering and sort. */
export function limitFindings(findings: ForensicsFinding[], limit: number): ForensicsFinding[] {
  return findings.slice(0, limit);
}

/**
 * Tally regression causes across all findings.
 *
 * Includes derived `idle` causes that have already been annotated by
 * `detectIdleRegressions`.
 */
export function breakdownCauses(findings: ForensicsFinding[]): CauseBreakdown {
  const breakdown: CauseBreakdown = {
    compaction: 0,
    branch_summary: 0,
    model_change: 0,
    prompt_change: 0,
    unknown: 0,
    idle: 0,
  };

  for (const f of findings) {
    const key = f.cause.type as keyof CauseBreakdown;
    if (key in breakdown) {
      breakdown[key]++;
    }
  }

  return breakdown;
}

/**
 * Attach preceding tool-call shapes to each regression finding.
 *
 * `toolWindows` is a per-session Map from turnIndex to the ToolCallShape[]
 * extracted from the N assistant messages before that turn.
 */
export function correlateTools(findings: ForensicsFinding[]): ForensicsFinding[] {
  // Tool windows are already attached during extraction; this query filters
  // and ranks findings so a result limit keeps the largest drops.
  return findings.filter((f) => f.toolsBefore.length > 0).sort((a, b) => b.drop - a.drop);
}

/**
 * Reclassify `unknown`-cause regressions as `idle` when the inter-turn gap
 * exceeds the configured threshold.
 *
 * Mutates findings in place for efficiency (call on a copy if immutability
 * is required).
 */
export function detectIdleRegressions(
  findings: ForensicsFinding[],
  thresholdMinutes: number,
): ForensicsFinding[] {
  for (const f of findings) {
    if (f.cause.type !== "unknown") continue;
    if (f.idleGapMinutes === undefined) continue;
    if (f.idleGapMinutes >= thresholdMinutes) {
      f.cause = { type: "idle", idleGapMinutes: f.idleGapMinutes };
    }
  }
  return findings;
}
