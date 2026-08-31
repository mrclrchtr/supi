import {
  type CodeRequestControl,
  isCodeRequestInterruption,
} from "@mrclrchtr/supi-code-runtime/api";
import {
  emptyProcessCrashRecoverySummary,
  type WorkspaceDiagnosticReport,
  type WorkspaceLspRuntime,
} from "@mrclrchtr/supi-lsp/api";
import { recoverDiagnosticRuntime } from "../analysis/health/recovery.ts";
import { mergeDiagnosticEvidence } from "../diagnostics/evidence.ts";
import { refreshFileLspMaintenance, refreshLspMaintenance } from "../substrate/lsp/maintenance.ts";
import type { HealthDiagnosticScope, HealthRefreshAttempt } from "./health-types.ts";

interface HealthRefreshAttemptOptions {
  readonly runtime: WorkspaceLspRuntime;
  readonly diagnosticsScope: HealthDiagnosticScope;
  readonly attemptedAt: number;
  readonly cwd: string;
  readonly sentinelSnapshot: Map<string, number>;
  readonly control?: CodeRequestControl;
  readonly reportRecoveryProgress?: () => void;
}

export interface HealthRefreshCollection {
  readonly attempt: HealthRefreshAttempt;
  /** Final report from the runtime, retained only for the current workflow. */
  readonly diagnosticReport?: WorkspaceDiagnosticReport;
}

/** Run one file- or workspace-scoped health refresh attempt. */
export async function collectHealthRefreshAttempt(
  options: HealthRefreshAttemptOptions,
): Promise<HealthRefreshCollection> {
  if (options.diagnosticsScope.kind === "file") {
    return collectFileRefreshAttempt(options, options.diagnosticsScope);
  }
  return collectWorkspaceRefreshAttempt(options);
}

async function collectFileRefreshAttempt(
  options: HealthRefreshAttemptOptions,
  scope: Extract<HealthDiagnosticScope, { kind: "file" }>,
): Promise<HealthRefreshCollection> {
  const maintenance = await refreshFileLspMaintenance({
    runtime: options.runtime,
    cwd: options.cwd,
    sentinelSnapshot: options.sentinelSnapshot,
    filePath: scope.path,
    control: options.control,
  });
  updateSentinelSnapshot(options.sentinelSnapshot, maintenance.snapshot);
  const readiness = await options.runtime.waitUntilReadyForFile(
    scope.path,
    undefined,
    options.control,
  );
  return {
    attempt: {
      kind: "completed",
      attemptedAt: options.attemptedAt,
      elapsedMs: Date.now() - options.attemptedAt,
      requestedDiagnosticScope: scope,
      operationScope: "file-runtime",
      attemptedActiveClients: readiness.kind === "ready" ? 1 : 0,
      restartedClients: 0,
      processCrashRecovery: readiness.processCrashRecovery ?? emptyProcessCrashRecoverySummary(),
      staleAssessment: {
        scope: "file",
        suspected: null,
        matchedFileCount: maintenance.matchedStaleFileCount,
        warning: null,
      },
    },
  };
}

async function collectWorkspaceRefreshAttempt(
  options: HealthRefreshAttemptOptions,
): Promise<HealthRefreshCollection> {
  const workspaceScope =
    options.diagnosticsScope.kind === "tracked-files" ? options.diagnosticsScope : null;
  const maintenance = await refreshLspMaintenance(
    options.runtime,
    options.cwd,
    options.sentinelSnapshot,
    {
      control: options.control,
      scope: workspaceScope?.filter ?? null,
      trackSources: workspaceScope !== null,
    },
  );
  updateSentinelSnapshot(options.sentinelSnapshot, maintenance.snapshot);
  if (maintenance.failureReason) {
    return {
      attempt: {
        kind: "failed",
        attemptedAt: options.attemptedAt,
        elapsedMs: Date.now() - options.attemptedAt,
        requestedDiagnosticScope: options.diagnosticsScope,
        operationScope: "workspace-runtime",
        diagnosticEvidence: maintenance.diagnosticEvidence,
        reason: maintenance.failureReason,
      },
    };
  }

  try {
    const recovery = await recoverDiagnosticRuntime({
      service: options.runtime,
      control: options.control,
      progress: options.reportRecoveryProgress,
      // The maintenance pass already refreshed every running route. Reuse its
      // evidence unless process-crash demand restores a required route; the
      // runtime then performs a fresh pass that includes the replacement.
      initialEvidence: maintenance.diagnosticEvidence,
      processCrashDemand: {
        ...(workspaceScope?.filter ? { scopes: [workspaceScope.filter] } : {}),
      },
    });
    const diagnosticEvidence = mergeDiagnosticEvidence(
      maintenance.diagnosticEvidence,
      recovery.diagnosticEvidence,
      options.cwd,
    );
    if (recovery.refreshFailureReason) {
      return {
        attempt: {
          kind: "failed",
          attemptedAt: options.attemptedAt,
          elapsedMs: Date.now() - options.attemptedAt,
          requestedDiagnosticScope: options.diagnosticsScope,
          operationScope: "workspace-runtime",
          attemptedActiveClients: recovery.attemptedClients,
          restartedClients: recovery.restartedClients,
          staleAssessment: {
            scope: "workspace",
            suspected: recovery.staleAssessment.suspected,
            matchedFileCount: recovery.staleAssessment.matchedFiles.length,
            warning: recovery.staleAssessment.warning,
          },
          diagnosticEvidence,
          processCrashRecovery: recovery.processCrashRecovery,
          reason: recovery.refreshFailureReason,
        },
        diagnosticReport: recovery.diagnosticReport,
      };
    }
    return {
      attempt: {
        kind: "completed",
        attemptedAt: options.attemptedAt,
        elapsedMs: Date.now() - options.attemptedAt,
        requestedDiagnosticScope: options.diagnosticsScope,
        operationScope: "workspace-runtime",
        attemptedActiveClients: recovery.attemptedClients,
        restartedClients: recovery.restartedClients,
        processCrashRecovery: recovery.processCrashRecovery,
        diagnosticEvidence,
        staleAssessment: {
          scope: "workspace",
          suspected: recovery.staleAssessment.suspected,
          matchedFileCount: recovery.staleAssessment.matchedFiles.length,
          warning: recovery.staleAssessment.warning,
        },
      },
      diagnosticReport: recovery.diagnosticReport,
    };
  } catch (error) {
    // Cancellation must propagate; a cancelled caller no longer awaits a
    // recorded failed attempt.
    if (isCodeRequestInterruption(error, options.control)) throw error;
    return {
      attempt: {
        kind: "failed",
        attemptedAt: options.attemptedAt,
        elapsedMs: Date.now() - options.attemptedAt,
        requestedDiagnosticScope: options.diagnosticsScope,
        operationScope: "workspace-runtime",
        diagnosticEvidence: maintenance.diagnosticEvidence,
        reason: errorMessage(error),
      },
    };
  }
}

function updateSentinelSnapshot(target: Map<string, number>, next: Map<string, number>): void {
  target.clear();
  for (const [key, value] of next) target.set(key, value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Diagnostic refresh failed.";
}
