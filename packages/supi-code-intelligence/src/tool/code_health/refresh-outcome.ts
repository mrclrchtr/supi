import type {
  ProcessCrashRecoveryEntry,
  ProcessCrashRecoveryReport,
} from "@mrclrchtr/supi-lsp/api";
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

/** Format process-crash counts for the compact health view. */
export function formatCompactProcessCrashRecovery(
  report: ProcessCrashRecoveryReport | null | undefined,
): string | null {
  if (
    !report ||
    (report.recoveredRoutes === 0 &&
      report.skippedRoutes === 0 &&
      report.failedRoutes === 0 &&
      report.exhaustedRoutes === 0)
  ) {
    return null;
  }
  return `process-crash recovery: ${report.recoveredRoutes} route${plural(report.recoveredRoutes)} recovered (${report.skippedRoutes} skipped, ${report.failedRoutes} failed, ${report.exhaustedRoutes} exhausted)`;
}

/** Format process-crash counts and bounded route entries for detailed health output. */
export function formatProcessCrashRecovery(
  report: ProcessCrashRecoveryReport | null | undefined,
): string | null {
  const summary = formatCompactProcessCrashRecovery(report);
  if (!summary || !report) return summary;
  const entries = report.entries.map(formatProcessCrashRecoveryEntry);
  const omitted =
    report.omittedEntries > 0
      ? `${report.omittedEntries} more route${plural(report.omittedEntries)}`
      : null;
  const details = [...entries, omitted]
    .filter((value): value is string => value !== null)
    .join("; ");
  return details ? `${summary}; ${details}` : summary;
}

function formatProcessCrashRecoveryEntry(entry: ProcessCrashRecoveryEntry): string {
  const outcome = entry.outcome.replaceAll("-", " ");
  const action = entry.nextAction ? `; next: ${entry.nextAction.replaceAll("-", " ")}` : "";
  const failure = entry.failureMessage ? `; ${entry.failureMessage}` : "";
  return `${entry.name} @ ${entry.root}: ${outcome}${action}${failure}`;
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
