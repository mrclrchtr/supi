import * as path from "node:path";
import {
  type CodeRequestControl,
  isCodeRequestInterruption,
  throwIfCodeRequestInterrupted,
} from "@mrclrchtr/supi-code-runtime/api";
import type { RecoveryRestartReason } from "../client/client.ts";
import { getDiagnosticFileState } from "../client/client-file-state.ts";
import type { Diagnostic, FileEvent } from "../config/types.ts";
import {
  type DiagnosticEvidenceDocument,
  type DiagnosticEvidenceSummary,
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
  /** Server names of the active clients targeted by this pass, for telemetry identity. */
  attemptedServers: string[];
  /** Server names of the clients restarted during this pass, for telemetry identity. */
  restartedServers: string[];
  /** Stall signal of the first restarted route, when this pass restarted a client. */
  restartReason?: RecoveryRestartReason;
  /** Final document-level evidence from this pass, starting from the caller's initial evidence when one was supplied. */
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
  /** Protocol-stall signal observed on the route, or null when healthy. */
  stallSignal: RecoveryRestartReason | null;
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
  getRunningClientNames(): string[];
  isDiagnosticFile(filePath: string): boolean;
  getClientDiagnosticRoutes(): WorkspaceDiagnosticRoute[];
  getDiagnosticEvidence(): DiagnosticEvidenceSummary;
  getCwd(): string;
  restartClientsForFiles(
    filePaths: string[],
    options?: { pushOnly?: boolean; control?: CodeRequestControl },
  ): Promise<Array<{ key: string; serverName: string; files: string[]; restarted: boolean }>>;
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
 * When the caller already ran a refresh this pass, it can hand its evidence in
 * `initialEvidence`; the recovery pass then skips its own initial refresh and
 * still runs stale assessment and restart escalation on the current state.
 * Caller evidence is only reused when the pass applies no watched-file changes:
 * evidence captured before a change would otherwise be reported as current
 * after it.
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
    /** Evidence from a refresh the caller already completed; skips this pass's own refresh when no watched-file changes apply. */
    initialEvidence?: DiagnosticEvidenceSummary;
    control?: CodeRequestControl;
  } = {},
): Promise<WorkspaceRecoveryResult> {
  // Reject immediately when the request was already cancelled: no client or
  // evidence work may start for a pass the caller no longer awaits.
  throwIfCodeRequestInterrupted(options.control);
  const recoveryStartedAt = Date.now();
  const initial = await collectInitialEvidence(host, options);
  const attemptedClients = initial.attemptedClients;
  const attemptedServers = host.getRunningClientNames();
  let diagnosticEvidence = initial.diagnosticEvidence;
  let refreshFailureReason = initial.refreshFailureReason;

  let staleAssessment = assessStaleDiagnostics(host.getOutstandingDiagnostics(1));
  let restartedClients = 0;
  let restartServerNames: string[] = [];
  let restartReason: RecoveryRestartReason | undefined;

  if (options.restartIfStillStale) {
    // Observe cancellation between pass phases: an abort that arrived during
    // the first refresh stops the pass before any client restart.
    throwIfCodeRequestInterrupted(options.control);
    const restartTargets = collectRecoveryRestartTargets(host);
    const restartFiles = restartTargets.flatMap((target) => target.files);
    if (restartFiles.length > 0) {
      const escalation = await runRestartEscalation(host, {
        restartFiles,
        restartTargets,
        evidence: diagnosticEvidence,
        ...options,
      });
      restartedClients = escalation.restartedClients;
      restartServerNames = escalation.restartedServerNames;
      restartReason = escalation.restartReason;
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
      attemptedServers,
      restartedServers: restartServerNames,
      ...(restartReason ? { restartReason } : {}),
      diagnosticEvidence,
      ...(refreshFailureReason ? { refreshFailureReason } : {}),
      elapsedMs: Date.now() - recoveryStartedAt,
      staleAssessment,
    };
  }
}

/** One push-only route that a recovery pass may restart. */
interface RecoveryRestartTarget {
  key: string;
  reason: RecoveryRestartReason;
  files: string[];
}

/** Establish the pass's starting evidence: caller-supplied reuse or a fresh refresh. */
async function collectInitialEvidence(
  host: WorkspaceRecoveryHost,
  options: {
    changes?: FileEvent[];
    initialEvidence?: DiagnosticEvidenceSummary;
    maxWaitMs?: number;
    quietMs?: number;
    control?: CodeRequestControl;
  },
): Promise<{
  attemptedClients: number;
  diagnosticEvidence: DiagnosticEvidenceSummary;
  refreshFailureReason?: string;
}> {
  const changes = options.changes ?? [];
  if (options.initialEvidence !== undefined && changes.length === 0) {
    // Reuse skips the soft invalidation: the caller already refreshed this
    // pass, and clearing cached pull result IDs without a refresh only forces
    // a full pull on a later pass.
    return {
      attemptedClients: host.getRunningClientCount(),
      diagnosticEvidence: options.initialEvidence,
    };
  }
  const attemptedClients = softRecoverWorkspaceDiagnostics(host, changes);
  try {
    return {
      attemptedClients,
      diagnosticEvidence: await host.refreshOpenDiagnostics({
        maxWaitMs: options.maxWaitMs,
        quietMs: options.quietMs,
        ...options.control,
      }),
    };
  } catch (error) {
    if (isCodeRequestInterruption(error, options.control)) throw error;
    return {
      attemptedClients,
      diagnosticEvidence: host.getDiagnosticEvidence(),
      refreshFailureReason: errorMessage(error),
    };
  }
}

/**
 * Collect restart targets: push-only routes with a protocol-stall signal.
 *
 * Unconfirmed evidence alone never restarts a client: the reopen-resync
 * fallback handles unconfirmed push-only documents without discarding
 * server state (ADR 0020). Restarts require a readiness stall or repeated
 * protocol failures, and stay limited to push-only routes.
 */
function collectRecoveryRestartTargets(host: WorkspaceRecoveryHost): RecoveryRestartTarget[] {
  const targets: RecoveryRestartTarget[] = [];
  for (const route of host.getClientDiagnosticRoutes()) {
    if (route.supportsPull) continue;
    if (!route.stallSignal) continue;
    if (route.unconfirmedFiles.length === 0) continue;
    targets.push({
      key: route.key,
      reason: route.stallSignal,
      files: route.unconfirmedFiles,
    });
  }
  return targets;
}

/**
 * Restart affected push-only clients and merge the replacement refresh evidence.
 *
 * Cancellation observed during the escalation is propagated as a rejection;
 * only non-interruption failures degrade to unconfirmed evidence.
 */
async function runRestartEscalation(
  host: WorkspaceRecoveryHost,
  options: {
    restartFiles: readonly string[];
    restartTargets: readonly RecoveryRestartTarget[];
    evidence: DiagnosticEvidenceSummary;
    maxWaitMs?: number;
    quietMs?: number;
    control?: CodeRequestControl;
  },
): Promise<{
  restartedClients: number;
  restartedServerNames: string[];
  restartReason?: RecoveryRestartReason;
  diagnosticEvidence: DiagnosticEvidenceSummary;
  refreshedAfterRestart: boolean;
}> {
  const { restartFiles, restartTargets, evidence } = options;
  const reasonByKey = new Map(restartTargets.map((target) => [target.key, target.reason]));
  let diagnosticEvidence = evidence;
  let restartedClients = 0;
  let restartedServerNames: string[] = [];
  let restartReason: RecoveryRestartReason | undefined;
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
    restartedServerNames = restarted.map((result) => result.serverName);
    restartReason = firstRestartReason(restarted, reasonByKey);
    // Every attempted route had its client replaced or shut down; its owned
    // files need fresh evidence. Routes the manager skipped (pull-capable or
    // guard-blocked) produce no result and keep their refreshed evidence.
    const attemptedFiles = restartResults
      .flatMap((result) => result.files)
      .filter((file) => host.isDiagnosticFile(file));
    diagnosticEvidence = invalidateDiagnosticEvidence(evidence, attemptedFiles, host.getCwd());

    if (restarted.length > 0) {
      try {
        diagnosticEvidence = mergeDiagnosticEvidence(
          diagnosticEvidence,
          await host.refreshOpenDiagnostics({
            maxWaitMs: options.maxWaitMs,
            quietMs: options.quietMs,
            ...options.control,
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

  return {
    restartedClients,
    restartedServerNames,
    ...(restartReason ? { restartReason } : {}),
    diagnosticEvidence,
    refreshedAfterRestart,
  };
}

/** Return the stall signal of the first route that actually restarted. */
function firstRestartReason(
  restarted: Array<{ key: string }>,
  reasonByKey: ReadonlyMap<string, RecoveryRestartReason>,
): RecoveryRestartReason | undefined {
  for (const result of restarted) {
    const reason = reasonByKey.get(result.key);
    if (reason !== undefined) return reason;
  }
  return undefined;
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
