import {
  type CodeRequestControl,
  isCodeRequestInterruption,
} from "@mrclrchtr/supi-code-runtime/api";
import {
  emptyProcessCrashRecoveryReport,
  type WorkspaceDiagnosticReport,
  type WorkspaceLspRuntime,
} from "@mrclrchtr/supi-lsp/api";
import { recoverDiagnosticRuntime } from "../analysis/health/recovery.ts";
import { mergeDiagnosticEvidence } from "../diagnostics/evidence.ts";
import { refreshFileLspMaintenance, refreshLspMaintenance } from "../substrate/lsp/maintenance.ts";
import type { LspMaintenanceState } from "../substrate/lsp/source-tracking.ts";
import type {
  HealthDiagnosticScope,
  HealthFileReadiness,
  HealthRefreshAttempt,
} from "./health-types.ts";

interface HealthRefreshAttemptOptions {
  readonly runtime: WorkspaceLspRuntime;
  readonly diagnosticsScope: HealthDiagnosticScope;
  readonly attemptedAt: number;
  readonly cwd: string;
  readonly maintenanceState: LspMaintenanceState;
  readonly control?: CodeRequestControl;
  readonly reportRecoveryProgress?: () => void;
}

export interface HealthRefreshCollection {
  readonly attempt: HealthRefreshAttempt;
  /** Next typed maintenance state, committed only after the attempt returns. */
  readonly maintenanceState: LspMaintenanceState;
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
    maintenanceState: options.maintenanceState,
    filePath: scope.path,
    control: options.control,
  });
  const readiness = await options.runtime.waitUntilReadyForFile(
    scope.path,
    undefined,
    options.control,
  );
  const fileReadiness: HealthFileReadiness =
    readiness.kind === "ready" ? "ready" : readiness.kind === "timeout" ? "pending" : "unavailable";
  return {
    maintenanceState: maintenance.maintenanceState,
    attempt: {
      kind: "completed",
      attemptedAt: options.attemptedAt,
      elapsedMs: Date.now() - options.attemptedAt,
      requestedDiagnosticScope: scope,
      operationScope: "file-runtime",
      attemptedActiveClients: readiness.kind === "ready" ? 1 : 0,
      fileReadiness,
      restartedClients: 0,
      processCrashRecovery: readiness.processCrashRecovery ?? emptyProcessCrashRecoveryReport(),
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
    options.maintenanceState,
    {
      control: options.control,
      scope: workspaceScope?.filter ?? null,
      trackSources: workspaceScope !== null,
    },
  );
  if (maintenance.failureReason) {
    return {
      maintenanceState: maintenance.maintenanceState,
      attempt: {
        kind: "failed",
        attemptedAt: options.attemptedAt,
        elapsedMs: Date.now() - options.attemptedAt,
        requestedDiagnosticScope: options.diagnosticsScope,
        operationScope: "workspace-runtime",
        diagnosticEvidence: maintenance.diagnosticEvidence,
        processCrashRecovery: emptyProcessCrashRecoveryReport(),
        ...(maintenance.sourceTracking ? { sourceTracking: maintenance.sourceTracking } : {}),
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
        maintenanceState: maintenance.maintenanceState,
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
          ...(maintenance.sourceTracking ? { sourceTracking: maintenance.sourceTracking } : {}),
          reason: recovery.refreshFailureReason,
        },
        diagnosticReport: recovery.diagnosticReport,
      };
    }
    return {
      maintenanceState: maintenance.maintenanceState,
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
        ...(maintenance.sourceTracking ? { sourceTracking: maintenance.sourceTracking } : {}),
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
      maintenanceState: maintenance.maintenanceState,
      attempt: {
        kind: "failed",
        attemptedAt: options.attemptedAt,
        elapsedMs: Date.now() - options.attemptedAt,
        requestedDiagnosticScope: options.diagnosticsScope,
        operationScope: "workspace-runtime",
        diagnosticEvidence: maintenance.diagnosticEvidence,
        processCrashRecovery: emptyProcessCrashRecoveryReport(),
        ...(maintenance.sourceTracking ? { sourceTracking: maintenance.sourceTracking } : {}),
        reason: errorMessage(error),
      },
    };
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Diagnostic refresh failed.";
}
