/** Reason for a partial or unavailable single-file result when the push stays tentative. */
export const TENTATIVE_PUSH_UNAVAILABLE_REASON =
  "The current push publication is tentative: a later diagnostic republish for the same document synchronization is required.";

/** A final evidence state for one tracked document. */
export type DiagnosticEvidenceStatus = "confirmed" | "unconfirmed" | "failed" | "removed";

/** Freshness evidence for one tracked document. */
export interface DiagnosticEvidenceDocument {
  readonly file: string;
  readonly status: DiagnosticEvidenceStatus;
}

/** Exact document coverage from a diagnostic snapshot or refresh attempt. */
export interface DiagnosticEvidenceSummary {
  readonly requested: number;
  readonly confirmed: number;
  readonly unconfirmed: number;
  readonly failed: number;
  readonly removed: number;
  readonly documents: readonly DiagnosticEvidenceDocument[];
}

/** Build exact coverage counts from one document outcome per requested document. */
export function summarizeDiagnosticEvidence(
  documents: readonly DiagnosticEvidenceDocument[],
): DiagnosticEvidenceSummary {
  const counts = {
    requested: documents.length,
    confirmed: 0,
    unconfirmed: 0,
    failed: 0,
    removed: 0,
  };
  for (const document of documents) counts[document.status]++;
  return { ...counts, documents: [...documents] };
}

/** Return an empty evidence summary for a refresh with no tracked documents. */
export function emptyDiagnosticEvidence(): DiagnosticEvidenceSummary {
  return summarizeDiagnosticEvidence([]);
}
