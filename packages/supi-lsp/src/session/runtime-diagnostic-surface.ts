import type { CodeQueryResult, CodeRequestControl } from "@mrclrchtr/supi-code-runtime/api";
import type { Diagnostic } from "../config/types.ts";
import type {
  DiagnosticEvidenceSummary,
  OutstandingDiagnosticSummaryEntry,
  RecoverDiagnosticsResult,
  WorkspaceDiagnosticSnapshot,
  WorkspaceDiagnosticSummaryEntry,
} from "./runtime-diagnostics.ts";

/** Diagnostic and recovery operations owned by a workspace LSP runtime. */
export interface WorkspaceLspDiagnosticSurface {
  fileDiagnostics(
    filePath: string,
    maxSeverity?: number,
    control?: CodeRequestControl,
  ): Promise<CodeQueryResult<Diagnostic[]>>;
  /** Re-synchronize tracked documents and return exact five-state evidence coverage. */
  refreshOpenDiagnostics(
    options?: { maxWaitMs?: number; quietMs?: number },
    control?: CodeRequestControl,
  ): Promise<DiagnosticEvidenceSummary>;
  /** Return tracked-file counts with aggregate cache freshness and evidence coverage. */
  getWorkspaceDiagnosticSummary(): WorkspaceDiagnosticSnapshot<WorkspaceDiagnosticSummaryEntry>;
  /** Return tracked-file messages with aggregate cache freshness and evidence coverage. */
  getOutstandingDiagnostics(
    maxSeverity?: number,
  ): WorkspaceDiagnosticSnapshot<{ file: string; diagnostics: Diagnostic[] }>;
  /** Return tracked-file severity counts with aggregate cache freshness and evidence coverage. */
  getOutstandingDiagnosticSummary(
    maxSeverity?: number,
  ): WorkspaceDiagnosticSnapshot<OutstandingDiagnosticSummaryEntry>;
  /** Run best-effort recovery and retain final diagnostic evidence, including failures. */
  recoverDiagnostics(options?: {
    restartIfStillStale?: boolean;
    maxWaitMs?: number;
    quietMs?: number;
    /** Evidence from a refresh the caller already completed; skips this pass's own refresh when no watched-file changes apply. */
    initialEvidence?: DiagnosticEvidenceSummary;
    control?: CodeRequestControl;
  }): Promise<RecoverDiagnosticsResult>;
}
