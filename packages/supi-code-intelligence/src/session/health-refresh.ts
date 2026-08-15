import {
  type CodeRequestControl,
  isCodeRequestInterruption,
} from "@mrclrchtr/supi-code-runtime/api";
import type { WorkspaceLspRuntime } from "@mrclrchtr/supi-lsp/api";
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

/** Run one file- or workspace-scoped health refresh attempt. */
export async function collectHealthRefreshAttempt(
  options: HealthRefreshAttemptOptions,
): Promise<HealthRefreshAttempt> {
  if (options.diagnosticsScope.kind === "file") {
    return collectFileRefreshAttempt(options, options.diagnosticsScope);
  }
  return collectWorkspaceRefreshAttempt(options);
}

async function collectFileRefreshAttempt(
  options: HealthRefreshAttemptOptions,
  scope: Extract<HealthDiagnosticScope, { kind: "file" }>,
): Promise<Extract<HealthRefreshAttempt, { kind: "completed" }>> {
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
    kind: "completed",
    attemptedAt: options.attemptedAt,
    elapsedMs: Date.now() - options.attemptedAt,
    requestedDiagnosticScope: scope,
    operationScope: "file-runtime",
    attemptedActiveClients: readiness.kind === "ready" ? 1 : 0,
    restartedClients: 0,
    staleAssessment: {
      scope: "file",
      suspected: null,
      matchedFileCount: maintenance.matchedStaleFileCount,
      warning: null,
    },
  };
}

async function collectWorkspaceRefreshAttempt(
  options: HealthRefreshAttemptOptions,
): Promise<HealthRefreshAttempt> {
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
      kind: "failed",
      attemptedAt: options.attemptedAt,
      elapsedMs: Date.now() - options.attemptedAt,
      requestedDiagnosticScope: options.diagnosticsScope,
      operationScope: "workspace-runtime",
      diagnosticEvidence: maintenance.diagnosticEvidence,
      reason: maintenance.failureReason,
    };
  }

  try {
    const recovery = await recoverDiagnosticRuntime({
      service: options.runtime,
      control: options.control,
      progress: options.reportRecoveryProgress,
      // The maintenance pass already refreshed every open document; reuse its
      // evidence so the recovery pass skips a redundant second refresh.
      initialEvidence: maintenance.diagnosticEvidence,
    });
    const diagnosticEvidence = mergeDiagnosticEvidence(
      maintenance.diagnosticEvidence,
      recovery.diagnosticEvidence,
      options.cwd,
    );
    if (recovery.refreshFailureReason) {
      return {
        kind: "failed",
        attemptedAt: options.attemptedAt,
        elapsedMs: Date.now() - options.attemptedAt,
        requestedDiagnosticScope: options.diagnosticsScope,
        operationScope: "workspace-runtime",
        diagnosticEvidence,
        reason: recovery.refreshFailureReason,
      };
    }
    return {
      kind: "completed",
      attemptedAt: options.attemptedAt,
      elapsedMs: Date.now() - options.attemptedAt,
      requestedDiagnosticScope: options.diagnosticsScope,
      operationScope: "workspace-runtime",
      attemptedActiveClients: recovery.attemptedClients,
      restartedClients: recovery.restartedClients,
      diagnosticEvidence,
      staleAssessment: {
        scope: "workspace",
        suspected: recovery.staleAssessment.suspected,
        matchedFileCount: recovery.staleAssessment.matchedFiles.length,
        warning: recovery.staleAssessment.warning,
      },
    };
  } catch (error) {
    // Cancellation must propagate; a cancelled caller no longer awaits a
    // recorded failed attempt.
    if (isCodeRequestInterruption(error, options.control)) throw error;
    return {
      kind: "failed",
      attemptedAt: options.attemptedAt,
      elapsedMs: Date.now() - options.attemptedAt,
      requestedDiagnosticScope: options.diagnosticsScope,
      operationScope: "workspace-runtime",
      diagnosticEvidence: maintenance.diagnosticEvidence,
      reason: errorMessage(error),
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
