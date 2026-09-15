/** Candidate fields used by the three target-selection row formats. */
export interface CandidateRowData {
  readonly targetId: string;
  readonly name: string;
  readonly kind: string | null;
  readonly file: string;
  readonly line: number;
  readonly character: number;
  readonly rank?: number;
}

/** The order used for the target id and rank in one candidate row. */
export type CandidateRowOrder = "handle-first" | "rank-first";

/** Format one candidate row for a serialized display section or TUI fallback. */
export function formatCandidateRow(
  candidate: CandidateRowData,
  order: CandidateRowOrder,
  fallbackRank = 1,
): string {
  const kind = candidate.kind ?? "unknown";
  if (order === "handle-first") {
    return `${candidate.targetId} — ${candidate.name} (${kind}) at ${candidate.file}:${candidate.line}:${candidate.character}`;
  }
  const rank = candidate.rank && candidate.rank > 0 ? candidate.rank : fallbackRank;
  return `${rank}. ${candidate.name} (${kind}) — ${candidate.file}:${candidate.line}:${candidate.character} [${candidate.targetId}]`;
}
