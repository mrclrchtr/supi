/** Formatting for diagnostic result and maintenance scopes and their evidence. */

function readRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

export function withDiagnosticScope(summary: string, data: Record<string, unknown> | null): string {
  const scope = formatDiagnosticScope(readDiagnosticScope(data));
  return scope ? `${summary} — evidence scope: ${scope}` : summary;
}

function readDiagnosticScope(data: Record<string, unknown> | null): Record<string, unknown> | null {
  return readRecord(readRecord(data?.diagnosticObservation)?.scope);
}

function formatDiagnosticScope(scope: Record<string, unknown> | null): string | null {
  if (scope?.kind === "file" && typeof scope.path === "string") {
    return `live file diagnostic request for ${scope.path}`;
  }
  if (scope?.kind === "tracked-files") {
    return typeof scope.filter === "string"
      ? `tracked-file diagnostic snapshot under ${scope.filter}`
      : "tracked-file diagnostic snapshot";
  }
  return null;
}

export function formatCompactDiagnosticEvidence(
  evidence: Record<string, unknown> | null,
  scopeKind: string | null,
): string | null {
  const counts = readEvidenceCounts(evidence);
  if (!counts) return null;
  const scopeLabel = scopeKind === "file" ? "file" : "tracked-file";
  return `${scopeLabel} evidence req ${counts[0]} · conf ${counts[1]} · unconf ${counts[2]} · failed ${counts[3]} · removed ${counts[4]}`;
}

export function formatDiagnosticEvidence(evidence: Record<string, unknown> | null): string | null {
  const counts = readEvidenceCounts(evidence);
  if (!counts) return null;
  return `${counts[0]} requested, ${counts[1]} confirmed, ${counts[2]} unconfirmed, ${counts[3]} failed, ${counts[4]} removed`;
}

export function formatMaintenanceEvidence(evidence: Record<string, unknown> | null): string | null {
  const counts = readEvidenceCounts(evidence);
  if (!counts) return null;
  return `maintenance evidence: ${counts[0]} requested, ${counts[1]} confirmed, ${counts[2]} unconfirmed, ${counts[3]} failed, ${counts[4]} removed`;
}

export function formatCompactMaintenanceEvidence(
  evidence: Record<string, unknown> | null,
): string | null {
  const counts = readEvidenceCounts(evidence);
  if (!counts) return null;
  return `maintenance evidence req ${counts[0]} · conf ${counts[1]} · unconf ${counts[2]} · failed ${counts[3]} · removed ${counts[4]}`;
}

export function formatMaintenanceScope(refresh: Record<string, unknown>): string | null {
  if (refresh.operationScope === "file-runtime") return "maintenance scope: file runtime";
  if (refresh.operationScope === "workspace-runtime") return "maintenance scope: workspace runtime";
  return null;
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
