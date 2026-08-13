import type { CodeQueryResult, CodeRequestControl } from "@mrclrchtr/supi-code-runtime/api";
import type { Diagnostic } from "../config/types.ts";
import type {
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
  refreshOpenDiagnostics(
    options?: { maxWaitMs?: number; quietMs?: number },
    control?: CodeRequestControl,
  ): Promise<void>;
  /** Return tracked-file counts with aggregate cache freshness. */
  getWorkspaceDiagnosticSummary(): WorkspaceDiagnosticSnapshot<WorkspaceDiagnosticSummaryEntry>;
  /** Return tracked-file messages with aggregate cache freshness. */
  getOutstandingDiagnostics(
    maxSeverity?: number,
  ): WorkspaceDiagnosticSnapshot<{ file: string; diagnostics: Diagnostic[] }>;
  /** Return tracked-file severity counts with aggregate cache freshness. */
  getOutstandingDiagnosticSummary(
    maxSeverity?: number,
  ): WorkspaceDiagnosticSnapshot<OutstandingDiagnosticSummaryEntry>;
  recoverDiagnostics(options?: {
    restartIfStillStale?: boolean;
    maxWaitMs?: number;
    quietMs?: number;
    control?: CodeRequestControl;
  }): Promise<RecoverDiagnosticsResult>;
}
