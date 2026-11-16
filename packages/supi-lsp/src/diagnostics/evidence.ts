/** Explain the lack of request-based confirmation when only ambient push evidence is available. */
export const TENTATIVE_PUSH_UNAVAILABLE_REASON =
  "Only ambient push diagnostics are available for this file; completion of the diagnostic check cannot be confirmed. An empty publication cannot confirm that the document is clean.";

/** A final evidence state for one tracked document. */
export type DiagnosticEvidenceStatus = "confirmed" | "unconfirmed" | "failed" | "removed";

/**
 * Why a document is not confirmed, when a specific cause is known.
 *
 * `disk-changed`: the file's disk metadata changed after its content was last
 * read and diagnosed, for example through an edit outside Pi.
 */
export type DiagnosticEvidenceReason = "disk-changed";

/** Freshness evidence for one tracked document. */
export interface DiagnosticEvidenceDocument {
  readonly file: string;
  readonly status: DiagnosticEvidenceStatus;
  /** Known cause for a non-confirmed status. */
  readonly reason?: DiagnosticEvidenceReason;
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

function evidenceStatusRank(status: DiagnosticEvidenceStatus): number {
  switch (status) {
    case "confirmed":
      return 1;
    case "unconfirmed":
      return 2;
    case "failed":
      return 3;
    case "removed":
      return 4;
  }
}

/**
 * Choose the more conservative of two documents for the same file.
 *
 * The higher status rank wins. For equal rank, a known `reason` is kept so a
 * reason-less duplicate from another route cannot drop it.
 */
export function preferEvidenceDocument(
  existing: DiagnosticEvidenceDocument | undefined,
  next: DiagnosticEvidenceDocument,
): DiagnosticEvidenceDocument {
  if (!existing) return next;
  const nextRank = evidenceStatusRank(next.status);
  const existingRank = evidenceStatusRank(existing.status);
  if (nextRank > existingRank) return next;
  if (nextRank < existingRank) return existing;
  if (existing.reason === undefined && next.reason !== undefined) return next;
  return existing;
}
