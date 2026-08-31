import { uriToFile } from "@mrclrchtr/supi-core/path";
import { type Diagnostic, DiagnosticSeverity } from "../config/types.ts";
import type { OutstandingDiagnosticSummaryEntry } from "../manager/manager-types.ts";
import { displayRelativeFilePath } from "../summary.ts";
import { effectiveDiagnosticSeverity } from "./diagnostic-severity.ts";

export function collectDiagnosticSummaryCounts(
  fileDiags: Map<string, { errors: number; warnings: number }>,
  entry: { uri: string; diagnostics: Diagnostic[] },
  cwd: string,
  includeFile: (file: string) => boolean,
): void {
  const file = relativeFilePathFromUri(entry.uri, cwd);
  if (!includeFile(file)) return;

  const current = fileDiags.get(file) ?? { errors: 0, warnings: 0 };
  for (const diagnostic of entry.diagnostics) {
    const severity = effectiveDiagnosticSeverity(diagnostic);
    if (severity === DiagnosticSeverity.Error) current.errors++;
    else if (severity === DiagnosticSeverity.Warning) current.warnings++;
  }
  fileDiags.set(file, current);
}

export function createOutstandingDiagnosticSummary(
  file: string,
): OutstandingDiagnosticSummaryEntry {
  return {
    file,
    total: 0,
    errors: 0,
    warnings: 0,
    information: 0,
    hints: 0,
  };
}

export function accumulateOutstandingDiagnostics(
  current: OutstandingDiagnosticSummaryEntry,
  diagnostics: Diagnostic[],
  maxSeverity: number,
): OutstandingDiagnosticSummaryEntry {
  const next = { ...current };

  for (const diagnostic of diagnostics) {
    if (!isDiagnosticWithinThreshold(diagnostic, maxSeverity)) continue;

    next.total++;
    incrementOutstandingDiagnosticCount(next, effectiveDiagnosticSeverity(diagnostic));
  }

  return next;
}

export function relativeFilePathFromUri(uri: string, cwd: string): string {
  return displayRelativeFilePath(uriToFile(uri), cwd);
}

function isDiagnosticWithinThreshold(diagnostic: Diagnostic, maxSeverity: number): boolean {
  return effectiveDiagnosticSeverity(diagnostic) <= maxSeverity;
}

function incrementOutstandingDiagnosticCount(
  entry: OutstandingDiagnosticSummaryEntry,
  severity: number,
): void {
  if (severity === DiagnosticSeverity.Error) entry.errors++;
  else if (severity === DiagnosticSeverity.Warning) entry.warnings++;
  else if (severity === DiagnosticSeverity.Information) entry.information++;
  else if (severity === DiagnosticSeverity.Hint) entry.hints++;
}
