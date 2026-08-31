import type { ProcessCrashRecoverySummary } from "@mrclrchtr/supi-lsp/api";
import {
  formatProcessCrashRecovery,
  formatStaleDiagnosticRestarts,
  isFileReadinessPending,
} from "./refresh-outcome.ts";
import { readSemanticHealthState } from "./semantic-state.ts";

/** Render current and retained health refresh status for the TUI. */

export function readRefreshStatus(data: Record<string, unknown> | null): string | null {
  const refresh = readRecord(data?.refresh);
  if (!refresh) return null;

  switch (refresh.kind) {
    case "completed":
      return formatCompletedRefreshStatus(refresh, isPendingFileReadiness(data));
    case "failed":
      return formatFailedRefreshStatus(refresh);
    case "not-attempted":
      return `refresh attempt not started${formatLastRefreshSuffix(refresh)}`;
    case "not-requested":
      return `refresh not requested${formatLastRefreshSuffix(refresh)}`;
    default:
      return null;
  }
}

function formatCompletedRefreshStatus(
  refresh: Record<string, unknown>,
  fileReadinessPending: boolean,
): string {
  const attempted = readNumber(refresh.attemptedActiveClients);
  const restarted = readNumber(refresh.restartedClients);
  const processCrashRecovery = formatProcessCrashRecovery(
    readProcessCrashRecovery(refresh.processCrashRecovery),
  );
  const noOp =
    !fileReadinessPending && attempted === 0 && restarted === 0 && processCrashRecovery === null;
  const label = refreshAttemptLabel(refresh);
  const base = fileReadinessPending
    ? `${label} waiting — LSP may still be warming; retry shortly`
    : noOp
      ? `${label} completed no-op`
      : `${label} completed: ${attempted} clients targeted`;
  const outcomes = formatRefreshOutcomes(refresh, restarted, processCrashRecovery, noOp);
  const withOutcome = outcomes.length > 0 ? `${base}; ${outcomes.join("; ")}` : base;
  const evidence = formatDiagnosticEvidence(readRecord(refresh.diagnosticEvidence));
  const withEvidence = evidence ? `${withOutcome}; ${evidence}` : withOutcome;
  const stale = readRecord(refresh.staleAssessment);
  return stale?.suspected === true
    ? `${withEvidence}; stale pattern suspected in ${readNumber(stale.matchedFileCount)} files`
    : withEvidence;
}

function formatFailedRefreshStatus(refresh: Record<string, unknown>): string {
  const processCrashRecovery = formatProcessCrashRecovery(
    readProcessCrashRecovery(refresh.processCrashRecovery),
  );
  const staleRestart = formatStaleDiagnosticRestartsForRecord(refresh);
  const evidence = formatDiagnosticEvidence(readRecord(refresh.diagnosticEvidence));
  const reason = typeof refresh.reason === "string" ? `: ${refresh.reason}` : "";
  return `${refreshAttemptLabel(refresh)} failed${reason}${staleRestart ? `; ${staleRestart}` : ""}${processCrashRecovery ? `; ${processCrashRecovery}` : ""}${evidence ? `; ${evidence}` : ""}`;
}

function formatRefreshOutcomes(
  refresh: Record<string, unknown>,
  restarted: number,
  processCrashRecovery: string | null,
  noOp: boolean,
): string[] {
  const outcomes: string[] = [];
  if (refresh.operationScope === "workspace-runtime" && !noOp) {
    outcomes.push(formatStaleDiagnosticRestarts(restarted));
  }
  if (processCrashRecovery) outcomes.push(processCrashRecovery);
  return outcomes;
}

/** Render only the material current recovery outcome for compact TUI chrome. */
export function readCompactRefreshStatus(data: Record<string, unknown> | null): string | null {
  const refresh = readRecord(data?.refresh);
  if (!refresh || (refresh.kind !== "completed" && refresh.kind !== "failed")) return null;

  const processCrashRecovery = formatProcessCrashRecovery(
    readProcessCrashRecovery(refresh.processCrashRecovery),
  );
  if (refresh.kind === "failed") {
    const staleRestart = formatStaleDiagnosticRestartsForRecord(refresh);
    return (
      [staleRestart, processCrashRecovery]
        .filter((value): value is string => value !== null)
        .join("; ") || null
    );
  }
  const fileReadinessPending = isPendingFileReadiness(data);
  if (
    !processCrashRecovery &&
    readNumber(refresh.restartedClients) === 0 &&
    !fileReadinessPending
  ) {
    return null;
  }

  const staleRestart = formatStaleDiagnosticRestartsForRecord(refresh);
  const readiness = fileReadinessPending ? "LSP may still be warming; retry shortly" : null;
  return [staleRestart, processCrashRecovery, readiness]
    .filter((value): value is string => value !== null)
    .join("; ");
}

export function readPreviousRefreshStatus(data: Record<string, unknown> | null): string | null {
  const refresh = readRecord(data?.refresh);
  if (!refresh || (refresh.kind !== "not-requested" && refresh.kind !== "not-attempted")) {
    return null;
  }
  const attempt = readRecord(refresh.lastAttempt);
  if (!attempt) return null;
  const evidence = formatCompactDiagnosticEvidence(readRecord(attempt.diagnosticEvidence));
  const processCrashRecovery = formatProcessCrashRecovery(
    readProcessCrashRecovery(attempt.processCrashRecovery),
  );
  const staleRestart = formatStaleDiagnosticRestartsForRecord(attempt);
  const fileReadinessPending =
    attempt.kind === "completed" &&
    isFileReadinessPending(attempt, readSemanticHealthState(data?.semanticState));
  const readiness = fileReadinessPending ? "LSP may still be warming; retry shortly" : null;
  const outcome = [readiness, staleRestart, processCrashRecovery, evidence]
    .filter((value): value is string => value !== null)
    .join("; ");
  if (attempt.kind === "failed") {
    return `last ${refreshAttemptLabel(attempt)} failed${outcome ? ` (${outcome})` : ""}`;
  }
  if (attempt.kind === "completed") {
    const status = fileReadinessPending ? "waiting" : "completed";
    return `last ${refreshAttemptLabel(attempt)} ${status}${outcome ? ` (${outcome})` : ""}`;
  }
  return null;
}

function refreshAttemptLabel(attempt: Record<string, unknown>): string {
  return attempt.operationScope === "file-runtime" ? "file maintenance attempt" : "refresh attempt";
}

function formatStaleDiagnosticRestartsForRecord(attempt: Record<string, unknown>): string | null {
  if (
    attempt.operationScope !== "workspace-runtime" ||
    typeof attempt.restartedClients !== "number"
  ) {
    return null;
  }
  const processCrashRecovery = formatProcessCrashRecovery(
    readProcessCrashRecovery(attempt.processCrashRecovery),
  );
  const noOp =
    attempt.kind === "completed" &&
    readNumber(attempt.attemptedActiveClients) === 0 &&
    attempt.restartedClients === 0 &&
    processCrashRecovery === null;
  return noOp ? null : formatStaleDiagnosticRestarts(attempt.restartedClients);
}

function formatLastRefreshSuffix(refresh: Record<string, unknown>): string {
  const attempt = readRecord(refresh.lastAttempt);
  if (!attempt) return "";
  const evidence = formatDiagnosticEvidence(readRecord(attempt.diagnosticEvidence));
  const staleRestart = formatStaleDiagnosticRestartsForRecord(attempt);
  const processCrashRecovery = formatProcessCrashRecovery(
    readProcessCrashRecovery(attempt.processCrashRecovery),
  );
  const fileReadinessPending =
    attempt.kind === "completed" && isFileReadinessPending(attempt, null);
  const readiness = fileReadinessPending ? "LSP may still be warming; retry shortly" : null;
  const outcome = [readiness, staleRestart, processCrashRecovery, evidence]
    .filter((value): value is string => value !== null)
    .join("; ");
  if (attempt.kind === "failed") {
    const reason = typeof attempt.reason === "string" ? `: ${attempt.reason}` : "";
    return `; last ${refreshAttemptLabel(attempt)} failed${reason}${outcome ? `; ${outcome}` : ""}`;
  }
  if (attempt.kind === "completed") {
    const status = fileReadinessPending ? "waiting" : "completed";
    return `; last ${refreshAttemptLabel(attempt)} ${status}${outcome ? `; ${outcome}` : ""}`;
  }
  return "";
}

function formatCompactDiagnosticEvidence(evidence: Record<string, unknown> | null): string | null {
  const counts = readEvidenceCounts(evidence);
  if (!counts) return null;
  return `req ${counts[0]} · conf ${counts[1]} · unconf ${counts[2]} · failed ${counts[3]} · removed ${counts[4]}`;
}

function formatDiagnosticEvidence(evidence: Record<string, unknown> | null): string | null {
  const counts = readEvidenceCounts(evidence);
  if (!counts) return null;
  return `${counts[0]} requested, ${counts[1]} confirmed, ${counts[2]} unconfirmed, ${counts[3]} failed, ${counts[4]} removed`;
}

export function isPendingFileReadiness(data: Record<string, unknown> | null): boolean {
  const observation = readRecord(data?.diagnosticObservation);
  const scope = readRecord(observation?.scope);
  if (scope?.kind !== "file") return false;

  const refresh = readRecord(data?.refresh);
  const attempt = refresh && typeof refresh.operationScope === "string" ? refresh : null;
  return isFileReadinessPending(attempt, readSemanticHealthState(data?.semanticState));
}

function readProcessCrashRecovery(value: unknown): ProcessCrashRecoverySummary | null {
  const summary = readRecord(value);
  if (!summary) return null;
  const attemptedRoutes = summary.attemptedRoutes;
  const recoveredRoutes = summary.recoveredRoutes;
  const failedRoutes = summary.failedRoutes;
  if (
    !isEvidenceCount(attemptedRoutes) ||
    !isEvidenceCount(recoveredRoutes) ||
    !isEvidenceCount(failedRoutes)
  ) {
    return null;
  }
  return { attemptedRoutes, recoveredRoutes, failedRoutes };
}

function readEvidenceCounts(evidence: Record<string, unknown> | null): number[] | null {
  if (!evidence) return null;
  const counts = [
    evidence.requested,
    evidence.confirmed,
    evidence.unconfirmed,
    evidence.failed,
    evidence.removed,
  ];
  return counts.every(isEvidenceCount) ? counts : null;
}

function isEvidenceCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function readNumber(value: unknown): number {
  return typeof value === "number" ? value : 0;
}
