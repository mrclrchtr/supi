/**
 * TUI-facing evidence badge string formatter.
 *
 * Pure string formatting — no pi-tui dependency. Consumes evidence
 * completeness metadata and produces compact human-readable badges.
 */

/** Metadata describing how many evidence atoms were shown vs exist. */
export interface EvidenceBadgeInput {
  shownCount: number;
  totalCount: number | null;
  omittedCount: number | null;
  partialReason: string | null;
  /** Human-readable label for the badge, e.g. "references", "symbols". */
  label: string;
}

/**
 * Format a compact evidence completeness badge.
 *
 * | Input                                                | Output                                |
 * |------------------------------------------------------|---------------------------------------|
 * | shown=12, total=12, omitted=0, label="references"   | `12 references`                       |
 * | shown=8,  total=20, omitted=12, label="symbols"     | `8 of 20 symbols (12 omitted)`        |
 * | shown=5, total=null, omitted=2, reason="timeout" | `5 matches (2 collected omitted; more may exist — timeout)` |
 */
export function formatEvidenceBadge(input: EvidenceBadgeInput): string {
  const { shownCount, totalCount, omittedCount, partialReason, label } = input;

  if (totalCount === null) {
    const reasonSuffix = partialReason ? ` — ${partialReason}` : "";
    const omittedPrefix = (omittedCount ?? 0) > 0 ? `${omittedCount} collected omitted; ` : "";
    return `${shownCount} ${label} (${omittedPrefix}more may exist${reasonSuffix})`;
  }

  if (omittedCount !== null && omittedCount > 0) {
    return `${shownCount} of ${totalCount} ${label} (${omittedCount} omitted)`;
  }

  return `${shownCount} ${label}`;
}
