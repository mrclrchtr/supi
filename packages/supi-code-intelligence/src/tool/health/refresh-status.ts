/** Render current and retained health refresh status for the TUI. */

export function readRefreshStatus(data: Record<string, unknown> | null): string | null {
  const refresh = readRecord(data?.refresh);
  if (!refresh) return null;

  switch (refresh.kind) {
    case "completed": {
      const attempted = readNumber(refresh.attemptedActiveClients);
      const restarted = readNumber(refresh.restartedClients);
      const stale = readRecord(refresh.staleAssessment);
      const noOp = attempted === 0 && restarted === 0;
      const label = refreshAttemptLabel(refresh);
      const base = noOp
        ? `${label} completed no-op`
        : `${label} completed: ${attempted} clients targeted, ${restarted} restarted`;
      const evidence = formatDiagnosticEvidence(readRecord(refresh.diagnosticEvidence));
      const withEvidence = evidence ? `${base}; ${evidence}` : base;
      return stale?.suspected === true
        ? `${withEvidence}; stale pattern suspected in ${readNumber(stale.matchedFileCount)} files`
        : withEvidence;
    }
    case "failed": {
      const evidence = formatDiagnosticEvidence(readRecord(refresh.diagnosticEvidence));
      return `${refreshAttemptLabel(refresh)} failed${typeof refresh.reason === "string" ? `: ${refresh.reason}` : ""}${evidence ? `; ${evidence}` : ""}`;
    }
    case "not-attempted":
      return `refresh attempt not started${formatLastRefreshSuffix(refresh)}`;
    case "not-requested":
      return `refresh not requested${formatLastRefreshSuffix(refresh)}`;
    default:
      return null;
  }
}

export function readPreviousRefreshStatus(data: Record<string, unknown> | null): string | null {
  const refresh = readRecord(data?.refresh);
  if (!refresh || (refresh.kind !== "not-requested" && refresh.kind !== "not-attempted")) {
    return null;
  }
  const attempt = readRecord(refresh.lastAttempt);
  if (!attempt) return null;
  const evidence = formatCompactDiagnosticEvidence(readRecord(attempt.diagnosticEvidence));
  if (attempt.kind === "failed") {
    return `last ${refreshAttemptLabel(attempt)} failed${evidence ? ` (${evidence})` : ""}`;
  }
  if (attempt.kind === "completed") {
    return `last ${refreshAttemptLabel(attempt)} completed${evidence ? ` (${evidence})` : ""}`;
  }
  return null;
}

function refreshAttemptLabel(attempt: Record<string, unknown>): string {
  return attempt.operationScope === "file-runtime" ? "file maintenance attempt" : "refresh attempt";
}

function formatLastRefreshSuffix(refresh: Record<string, unknown>): string {
  const attempt = readRecord(refresh.lastAttempt);
  if (!attempt) return "";
  const evidence = formatDiagnosticEvidence(readRecord(attempt.diagnosticEvidence));
  if (attempt.kind === "failed") {
    const reason = typeof attempt.reason === "string" ? `: ${attempt.reason}` : "";
    return `; last ${refreshAttemptLabel(attempt)} failed${reason}${evidence ? `; ${evidence}` : ""}`;
  }
  if (attempt.kind === "completed") {
    return `; last ${refreshAttemptLabel(attempt)} completed${evidence ? `; ${evidence}` : ""}`;
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
