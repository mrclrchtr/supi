import * as path from "node:path";
import {
  type CodeRequestControl,
  isCodeRequestInterruption,
  throwIfCodeRequestInterrupted,
} from "@mrclrchtr/supi-code-runtime/api";
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
  /** Wall-clock duration of the whole recovery pass, for telemetry. */
  elapsedMs: number;
  staleAssessment: StaleDiagnosticAssessment;
}

/** One client route's diagnostic evidence capability for recovery targeting. */
export interface WorkspaceDiagnosticRoute {
  key: string;
  /** False for push-only clients, which cannot confirm freshness by pull. */
  supportsPull: boolean;
  /** Files tracked by the route whose evidence is unconfirmed. */
  unconfirmedFiles: string[];
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
  getClientDiagnosticRoutes(): WorkspaceDiagnosticRoute[];
  getDiagnosticEvidence(): DiagnosticEvidenceSummary;
  getCwd(): string;
  restartClientsForFiles(
    filePaths: string[],
    options?: { pushOnly?: boolean; control?: CodeRequestControl },
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

/**
 * Run a recovery pass, refreshing diagnostics and escalating if stale state remains.
 *
 * The pass observes request cancellation between its phases and propagates
 * the interruption as a rejection instead of swallowing it. A pass that
 * starts already cancelled rejects before any client or evidence work.
 */
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
  // Reject immediately when the request was already cancelled: no client or
  // evidence work may start for a pass the caller no longer awaits.
  throwIfCodeRequestInterrupted(options.control);
  const recoveryStartedAt = Date.now();
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
    if (isCodeRequestInterruption(error, options.control)) throw error;
    refreshFailureReason = errorMessage(error);
    diagnosticEvidence = host.getDiagnosticEvidence();
  }

  let staleAssessment = assessStaleDiagnostics(host.getOutstandingDiagnostics(1));
  let restartedClients = 0;

  if (options.restartIfStillStale) {
    // Observe cancellation between pass phases: an abort that arrived during
    // the first refresh stops the pass before any client restart.
    throwIfCodeRequestInterrupted(options.control);
    const restartFiles = collectRecoveryRestartFiles(host, staleAssessment);
    if (restartFiles.length > 0) {
      const escalation = await runRestartEscalation(
        host,
        restartFiles,
        diagnosticEvidence,
        options,
      );
      restartedClients = escalation.restartedClients;
      diagnosticEvidence = escalation.diagnosticEvidence;
      if (escalation.refreshedAfterRestart) refreshFailureReason = undefined;
      staleAssessment = assessStaleDiagnostics(host.getOutstandingDiagnostics(1));
    }
  }

  // Observe cancellation before returning regardless of escalation: a
  // refresh-only pass must not report a clean result after the caller
  // cancelled the request.
  throwIfCodeRequestInterrupted(options.control);

  return recoveryResult();

  function recoveryResult(): WorkspaceRecoveryResult {
    return {
      attemptedClients,
      restartedClients,
      diagnosticEvidence,
      ...(refreshFailureReason ? { refreshFailureReason } : {}),
      elapsedMs: Date.now() - recoveryStartedAt,
      staleAssessment,
    };
  }
}

/** Collect restart targets: unconfirmed push-only routes plus stale clusters. */
function collectRecoveryRestartFiles(
  host: WorkspaceRecoveryHost,
  staleAssessment: StaleDiagnosticAssessment,
): string[] {
  const restartFiles = new Set<string>();
  // Targeted push-only recovery: restart routes whose evidence is still
  // unconfirmed after the first refresh. Pull-capable routes never restart
  // because push evidence is absent.
  for (const route of host.getClientDiagnosticRoutes()) {
    if (route.supportsPull) continue;
    for (const file of route.unconfirmedFiles) restartFiles.add(file);
  }
  // Supplemental stale-cluster heuristic, kept as an additional trigger.
  if (staleAssessment.suspected) {
    for (const entry of staleAssessment.matchedFiles) restartFiles.add(entry.file);
  }
  return Array.from(restartFiles);
}

/**
 * Restart affected push-only clients and merge the replacement refresh evidence.
 *
 * Cancellation observed during the escalation is propagated as a rejection;
 * only non-interruption failures degrade to unconfirmed evidence.
 */
async function runRestartEscalation(
  host: WorkspaceRecoveryHost,
  restartFiles: readonly string[],
  evidence: DiagnosticEvidenceSummary,
  options: {
    maxWaitMs?: number;
    quietMs?: number;
    control?: CodeRequestControl;
  },
): Promise<{
  restartedClients: number;
  diagnosticEvidence: DiagnosticEvidenceSummary;
  refreshedAfterRestart: boolean;
}> {
  // Invalidate only evidence that a restart can re-establish: the unconfirmed
  // push-only trigger files and every file owned by a route that actually
  // restarted. Files added by the stale-cluster heuristic that belong to a
  // pull-capable route keep their freshly refreshed evidence.
  const unconfirmedTriggerFiles = collectUnconfirmedPushOnlyFiles(host);
  let diagnosticEvidence = evidence;
  let restartedClients = 0;
  let refreshedAfterRestart = false;

  try {
    const restartResults = await host.restartClientsForFiles([...restartFiles], {
      pushOnly: true,
      control: options.control,
    });
    // Observe cancellation once the restart loop settles: a cancelled pass
    // must not invalidate or refresh evidence for replacement processes.
    throwIfCodeRequestInterrupted(options.control);
    const restarted = restartResults.filter((result) => result.restarted);
    restartedClients = restarted.length;
    // Every attempted route had its client replaced or shut down; its owned
    // files need fresh evidence. Routes the manager skipped (pull-capable or
    // guard-blocked) produce no result and keep their refreshed evidence.
    const attemptedFiles = restartResults
      .flatMap((result) => result.files)
      .filter((file) => host.isDiagnosticFile(file));
    diagnosticEvidence = invalidateDiagnosticEvidence(
      evidence,
      [...unconfirmedTriggerFiles, ...attemptedFiles],
      host.getCwd(),
    );

    if (restarted.length > 0) {
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
        // Observe cancellation after the replacement refresh: a cancelled
        // pass discards the fresh result instead of reporting it as current.
        throwIfCodeRequestInterrupted(options.control);
        refreshedAfterRestart = true;
      } catch (error) {
        if (isCodeRequestInterruption(error, options.control)) throw error;
        // Keep affected evidence unconfirmed when replacement refresh fails.
      }
    }
  } catch (error) {
    if (isCodeRequestInterruption(error, options.control)) throw error;
    // Keep affected evidence unconfirmed when replacement fails.
  }

  return { restartedClients, diagnosticEvidence, refreshedAfterRestart };
}

/** Collect diagnostic-visible unconfirmed files owned by push-only routes. */
function collectUnconfirmedPushOnlyFiles(host: WorkspaceRecoveryHost): string[] {
  const files: string[] = [];
  for (const route of host.getClientDiagnosticRoutes()) {
    if (route.supportsPull) continue;
    for (const file of route.unconfirmedFiles) {
      if (host.isDiagnosticFile(file)) files.push(file);
    }
  }
  return files;
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
