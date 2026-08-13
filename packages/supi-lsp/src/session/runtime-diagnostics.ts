import type { Diagnostic } from "../config/types.ts";

/** Workspace diagnostic snapshot with explicit cache freshness. */
export interface WorkspaceDiagnosticSnapshot<T> {
  entries: T[];
  current: boolean;
}

/** Workspace diagnostic summary grouped by file. */
export interface WorkspaceDiagnosticSummaryEntry {
  file: string;
  errors: number;
  warnings: number;
}

/** Outstanding diagnostics grouped by file, including info and hint counts. */
export interface OutstandingDiagnosticSummaryEntry {
  file: string;
  total: number;
  errors: number;
  warnings: number;
  information: number;
  hints: number;
}

/** Result from a workspace diagnostic recovery pass. */
export interface RecoverDiagnosticsResult {
  /** Active clients targeted by the best-effort refresh, not confirmed successful refreshes. */
  attemptedClients: number;
  restartedClients: number;
  staleAssessment: {
    suspected: boolean;
    matchedFiles: Array<{ file: string; diagnostics: Diagnostic[] }>;
    warning: string | null;
  };
}
