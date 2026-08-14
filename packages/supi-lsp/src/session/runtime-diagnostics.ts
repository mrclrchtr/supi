import type { Diagnostic } from "../config/types.ts";
import type { DiagnosticEvidenceSummary } from "../diagnostics/evidence.ts";

export type {
  DiagnosticEvidenceDocument,
  DiagnosticEvidenceStatus,
  DiagnosticEvidenceSummary,
} from "../diagnostics/evidence.ts";

/** Workspace diagnostic snapshot with explicit cache freshness and coverage. */
export interface WorkspaceDiagnosticSnapshot<T> {
  entries: T[];
  current: boolean;
  evidence: DiagnosticEvidenceSummary;
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
  /** Final document-level evidence from the last refresh in this recovery pass. */
  diagnosticEvidence: DiagnosticEvidenceSummary;
  /** Failure from the first refresh, when no later pass replaced it. */
  refreshFailureReason?: string;
  /** Wall-clock duration of the whole recovery pass, for telemetry. */
  elapsedMs: number;
  staleAssessment: {
    suspected: boolean;
    matchedFiles: Array<{ file: string; diagnostics: Diagnostic[] }>;
    warning: string | null;
  };
}
