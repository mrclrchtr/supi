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

/**
 * One coherent post-refresh observation of workspace diagnostics.
 *
 * Both projections are captured from the same client snapshots. The report is
 * short-lived and must not be retained as the runtime's last refresh attempt.
 */
export interface WorkspaceDiagnosticReport {
  summary: WorkspaceDiagnosticSnapshot<WorkspaceDiagnosticSummaryEntry>;
  outstanding: WorkspaceDiagnosticSnapshot<{
    file: string;
    diagnostics: Diagnostic[];
  }>;
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
  /** Evidence collected by the refresh and recovery operations. */
  diagnosticEvidence: DiagnosticEvidenceSummary;
  /** Final diagnostic report captured after all refresh and recovery work. */
  diagnosticReport: WorkspaceDiagnosticReport;
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

/** One tracked file's tsconfig scope decision, for debug telemetry. */
export interface ScopeDecisionEntry {
  /** Workspace-relative file path. */
  file: string;
  status: "included" | "excluded" | "no-config" | "out-of-tree";
  /** Decision mechanism; null when no decision applies. */
  basis: string | null;
}

/** Aggregate tsconfig scope decisions for all tracked files, for debug telemetry. */
export interface ScopeDecisionSummary {
  caseSensitiveFileNames: boolean;
  counts: {
    included: number;
    excluded: number;
    noConfig: number;
    outOfTree: number;
  };
  /** Exact decision-basis counts; keys are {@link ScopeDecisionEntry.basis} values. */
  basisCounts: Record<string, number>;
  /** Bounded workspace-relative entries (oldest first), not the full set. */
  entries: ScopeDecisionEntry[];
  /** Total number of tracked files the summary was computed over. */
  totalFiles: number;
}
