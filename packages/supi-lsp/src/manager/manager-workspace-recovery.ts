import * as path from "node:path";
import type { CodeRequestControl } from "@mrclrchtr/supi-code-runtime/api";
import { getDiagnosticFileState } from "../client/client-file-state.ts";
import type { Diagnostic, FileEvent } from "../config/types.ts";
import {
  type DiagnosticEvidenceDocument,
  type DiagnosticEvidenceSummary,
  emptyDiagnosticEvidence,
  summarizeDiagnosticEvidence,
} from "../diagnostics/evidence.ts";
import {
  assessStaleDiagnostics,
  type StaleDiagnosticAssessment,
} from "../diagnostics/stale-diagnostics.ts";

export interface WorkspaceRecoveryResult {
  /** Active clients targeted by the best-effort refresh, not confirmed successful refreshes. */
  attemptedClients: number;
  restartedClients: number;
  /** Final document-level evidence from the last refresh in this recovery pass. */
  diagnosticEvidence: DiagnosticEvidenceSummary;
  /** Failure from the first refresh, when no later pass replaced it. */
  refreshFailureReason?: string;
  staleAssessment: StaleDiagnosticAssessment;
}

export interface WorkspaceRecoveryHost {
  clearAllPullResultIds(): void;
  notifyWorkspaceFileChanges(changes: FileEvent[]): void;
  refreshOpenDiagnostics(
    options?: { maxWaitMs?: number; quietMs?: number } & CodeRequestControl,
  ): Promise<DiagnosticEvidenceSummary>;
  getOutstandingDiagnostics(
    maxSeverity?: number,
  ): Array<{ file: string; diagnostics: Diagnostic[] }>;
  getRunningClientCount(): number;
  isDiagnosticFile(filePath: string): boolean;
  getDiagnosticEvidence(): DiagnosticEvidenceSummary;
  getCwd(): string;
  restartClientsForFiles(
    filePaths: string[],
  ): Promise<Array<{ key: string; files: string[]; restarted: boolean }>>;
}

/** Clear cached pull IDs and forward watched-file changes to active clients. */
export function softRecoverWorkspaceDiagnostics(
  host: WorkspaceRecoveryHost,
  changes: FileEvent[] = [],
): number {
  host.clearAllPullResultIds();
  if (changes.length > 0) host.notifyWorkspaceFileChanges(changes);
  return host.getRunningClientCount();
}

/** Run a recovery pass, refreshing diagnostics and escalating if stale state remains. */
export async function recoverWorkspaceDiagnostics(
  host: WorkspaceRecoveryHost,
  options: {
    changes?: FileEvent[];
    restartIfStillStale?: boolean;
    maxWaitMs?: number;
    quietMs?: number;
    control?: CodeRequestControl;
  } = {},
): Promise<WorkspaceRecoveryResult> {
  const attemptedClients = softRecoverWorkspaceDiagnostics(host, options.changes ?? []);
  let diagnosticEvidence = emptyDiagnosticEvidence();
  let refreshFailureReason: string | undefined;

  try {
    diagnosticEvidence = await host.refreshOpenDiagnostics({
      maxWaitMs: options.maxWaitMs,
      quietMs: options.quietMs,
      operationId: options.control?.operationId,
    });
  } catch (error) {
    refreshFailureReason = errorMessage(error);
    diagnosticEvidence = host.getDiagnosticEvidence();
  }

  let staleAssessment = assessStaleDiagnostics(host.getOutstandingDiagnostics(1));
  let restartedClients = 0;

  if (options.restartIfStillStale && staleAssessment.suspected) {
    const affectedFiles = staleAssessment.matchedFiles.map((entry) => entry.file);
    const diagnosticAffectedFiles = affectedFiles.filter((file) => host.isDiagnosticFile(file));
    diagnosticEvidence = invalidateDiagnosticEvidence(
      diagnosticEvidence,
      diagnosticAffectedFiles,
      host.getCwd(),
    );

    try {
      const restartResults = await host.restartClientsForFiles(affectedFiles);
      const restarted = restartResults.filter((result) => result.restarted);
      restartedClients = restarted.length;
      const restartedFiles = restartResults
        .flatMap((result) => result.files)
        .filter((file) => host.isDiagnosticFile(file));
      diagnosticEvidence = invalidateDiagnosticEvidence(
        diagnosticEvidence,
        [...diagnosticAffectedFiles, ...restartedFiles],
        host.getCwd(),
      );

      if (restartedClients > 0) {
        try {
          diagnosticEvidence = mergeDiagnosticEvidence(
            diagnosticEvidence,
            await host.refreshOpenDiagnostics({
              maxWaitMs: options.maxWaitMs,
              quietMs: options.quietMs,
              operationId: options.control?.operationId,
            }),
            host.getCwd(),
          );
          refreshFailureReason = undefined;
        } catch {
          // Keep affected evidence unconfirmed when replacement refresh fails.
        }
      }
    } catch {
      // Keep affected evidence unconfirmed when replacement fails.
    }
    staleAssessment = assessStaleDiagnostics(host.getOutstandingDiagnostics(1));
  }

  return {
    attemptedClients,
    restartedClients,
    diagnosticEvidence,
    ...(refreshFailureReason ? { refreshFailureReason } : {}),
    staleAssessment,
  };
}

function invalidateDiagnosticEvidence(
  evidence: DiagnosticEvidenceSummary,
  files: readonly string[],
  cwd: string,
): DiagnosticEvidenceSummary {
  const affected = new Set(files.map((file) => path.resolve(cwd, file)));
  const documents = evidence.documents.map((document) =>
    affected.has(path.resolve(cwd, document.file))
      ? {
          ...document,
          status: invalidatedFileStatus(path.resolve(cwd, document.file)),
        }
      : document,
  );
  const known = new Set(documents.map((document) => path.resolve(cwd, document.file)));
  for (const file of files) {
    const resolved = path.resolve(cwd, file);
    if (!known.has(resolved)) {
      documents.push({
        file: path.relative(cwd, resolved),
        status: invalidatedFileStatus(resolved),
      });
      known.add(resolved);
    }
  }
  return summarizeDiagnosticEvidence(documents as DiagnosticEvidenceDocument[]);
}

function invalidatedFileStatus(filePath: string): "unconfirmed" | "failed" | "removed" {
  switch (getDiagnosticFileState(filePath)) {
    case "removed":
      return "removed";
    case "unreadable":
      return "failed";
    default:
      return "unconfirmed";
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Diagnostic refresh failed.";
}

function mergeDiagnosticEvidence(
  invalidated: DiagnosticEvidenceSummary,
  refreshed: DiagnosticEvidenceSummary,
  cwd: string,
): DiagnosticEvidenceSummary {
  const documents = new Map<string, DiagnosticEvidenceDocument>();
  for (const document of invalidated.documents) {
    const resolved = path.resolve(cwd, document.file);
    documents.set(resolved, {
      file: path.relative(cwd, resolved),
      status: document.status,
    });
  }
  for (const document of refreshed.documents) {
    const resolved = path.resolve(cwd, document.file);
    documents.set(resolved, {
      file: path.relative(cwd, resolved),
      status: document.status,
    });
  }
  return summarizeDiagnosticEvidence(Array.from(documents.values()));
}
