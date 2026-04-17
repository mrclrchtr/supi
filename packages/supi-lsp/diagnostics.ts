// Diagnostic formatting and severity utilities.

import * as path from "node:path";
import type { Diagnostic } from "./types.ts";

/** Map severity number to label. */
export function severityLabel(severity: number | undefined): string {
  switch (severity) {
    case 1:
      return "error";
    case 2:
      return "warning";
    case 3:
      return "info";
    case 4:
      return "hint";
    default:
      return "unknown";
  }
}

/** Map severity number to emoji. */
function severityIcon(severity: number | undefined): string {
  switch (severity) {
    case 1:
      return "❌";
    case 2:
      return "⚠️";
    case 3:
      return "ℹ️";
    case 4:
      return "💡";
    default:
      return "❓";
  }
}

/**
 * Format a single diagnostic for display.
 * Output: "❌ error [source] (line:col): message"
 */
export function formatDiagnostic(diag: Diagnostic): string {
  const icon = severityIcon(diag.severity);
  const sev = severityLabel(diag.severity);
  const line = diag.range.start.line + 1; // Convert 0-based to 1-based
  const col = diag.range.start.character + 1;
  const source = diag.source ? ` [${diag.source}]` : "";
  const code = diag.code !== undefined ? ` (${diag.code})` : "";
  return `${icon} ${sev}${source}${code} (${line}:${col}): ${diag.message}`;
}

/**
 * Format a list of diagnostics for a file.
 */
export function formatDiagnostics(filePath: string, diagnostics: Diagnostic[]): string {
  if (diagnostics.length === 0) return "No diagnostics.";

  const relPath = path.relative(process.cwd(), filePath);
  const lines = [`**${relPath}**:`];

  for (const diag of diagnostics) {
    lines.push(`  ${formatDiagnostic(diag)}`);
  }

  return lines.join("\n");
}

/**
 * Format diagnostics grouped by file.
 */
export function formatGroupedDiagnostics(
  entries: Array<{ file: string; diagnostics: Diagnostic[] }>,
): string {
  if (entries.length === 0) return "No diagnostics across any files.";

  const sections: string[] = [];
  for (const entry of entries) {
    if (entry.diagnostics.length > 0) {
      sections.push(formatDiagnostics(entry.file, entry.diagnostics));
    }
  }

  return sections.length > 0 ? sections.join("\n\n") : "No diagnostics.";
}

/**
 * Filter diagnostics by severity threshold.
 * Returns diagnostics with severity <= maxSeverity.
 * Severity 1 = error, 2 = warning, 3 = info, 4 = hint.
 */
export function filterBySeverity(diagnostics: Diagnostic[], maxSeverity: number): Diagnostic[] {
  return diagnostics.filter((d) => d.severity !== undefined && d.severity <= maxSeverity);
}
