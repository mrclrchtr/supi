import type { ProcessCrashRecoverySummary } from "@mrclrchtr/supi-lsp/api";
import type { SemanticHealthState } from "../../session/health-types.ts";

/** Report whether a file health result is waiting for semantic readiness. */
export function isFileReadinessPending(
  attempt: { operationScope?: string; fileReadiness?: string } | null | undefined,
  semanticState: SemanticHealthState | null | undefined,
): boolean {
  if (attempt?.operationScope !== undefined) {
    return (
      attempt.operationScope === "file-runtime" &&
      (attempt.fileReadiness === "pending" ||
        (attempt.fileReadiness === undefined && semanticState?.kind === "pending"))
    );
  }
  return semanticState?.kind === "pending";
}

/** Format the outcome of stale-diagnostic client restarts. */
export function formatStaleDiagnosticRestarts(restartedClients: number): string {
  return `stale diagnostic restarts: ${restartedClients} client${plural(restartedClients)} restarted`;
}

/** Format a non-empty process-crash route recovery outcome. */
export function formatProcessCrashRecovery(
  summary: ProcessCrashRecoverySummary | null | undefined,
): string | null {
  if (
    !summary ||
    (summary.attemptedRoutes === 0 && summary.recoveredRoutes === 0 && summary.failedRoutes === 0)
  ) {
    return null;
  }
  return `process-crash recovery: ${summary.recoveredRoutes} route${plural(summary.recoveredRoutes)} recovered (${summary.attemptedRoutes} attempted, ${summary.failedRoutes} failed)`;
}

/** Format the age of a retained refresh attempt for a status line. */
export function formatRefreshElapsed(milliseconds: number): string {
  const seconds = Math.max(0, Math.round(milliseconds / 1_000));
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.round(seconds / 60)}m ago`;
}

function plural(count: number): string {
  return count === 1 ? "" : "s";
}
