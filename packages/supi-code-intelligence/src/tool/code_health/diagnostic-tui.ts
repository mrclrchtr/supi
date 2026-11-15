/** Diagnostic-section readers and empty-result summary for the code_health TUI. */
import type { Theme } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { formatDiagnosticEvidence, withDiagnosticScope } from "./scope.ts";

/** An empty entry list is clean only when the shared coverage classification is `confirmed`. */
export function buildEmptyDiagnosticSummary(
  data: Record<string, unknown> | null,
  theme: Theme,
): Text {
  const coverage = data?.diagnosticCoverage;
  if (coverage === "none") {
    const files = diagnosticScopeKind(data) === "file" ? "requested" : "tracked";
    const label = `No source diagnostics checked (0 ${files} files)`;
    return new Text(theme.fg("dim", withDiagnosticScope(label, data)), 0, 0);
  }
  if (coverage === "incomplete") {
    const counts = formatDiagnosticEvidence(readDiagnosticEvidence(data));
    const label = `Diagnostic evidence incomplete${counts ? ` (${counts})` : ""}`;
    return new Text(theme.fg("warning", withDiagnosticScope(label, data)), 0, 0);
  }
  return new Text(
    theme.fg("success", withDiagnosticScope(diagnosticEmptySummary(data), data)),
    0,
    0,
  );
}

function diagnosticEmptySummary(data: Record<string, unknown> | null): string {
  return diagnosticScopeKind(data) === "file"
    ? "No errors or warnings for file"
    : "No reported issues in tracked files";
}

export function diagnosticScopeKind(data: Record<string, unknown> | null): string | null {
  const observation = readRecord(data?.diagnosticObservation);
  const scope = readRecord(observation?.scope);
  return typeof scope?.kind === "string" ? scope.kind : null;
}

export function readDiagnosticEvidence(
  data: Record<string, unknown> | null,
): Record<string, unknown> | null {
  return readRecord(readRecord(data?.diagnosticObservation)?.evidence);
}

export function readRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}
