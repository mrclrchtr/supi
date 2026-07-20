import * as path from "node:path";
import type { WorkspaceLspRuntimeState } from "@mrclrchtr/supi-lsp/api";

/** Bounded diagnostic facts that help choose which source to inspect next. */
export interface PrioritySignalsSummary {
  diagnosticsCount: number;
  warnings: string[];
}

/** Summarize current LSP diagnostics for the relevant source files. */
export function summarizePrioritySignalsForFiles(
  cwd: string,
  files: Iterable<string>,
  lspRuntime: WorkspaceLspRuntimeState,
): PrioritySignalsSummary | null {
  const relevantFiles = new Set([...files].map((file) => path.resolve(cwd, file)));
  if (relevantFiles.size === 0) return null;

  const matchingDiagnostics = loadDiagnostics(cwd, lspRuntime).filter((entry) =>
    relevantFiles.has(path.resolve(entry.file)),
  );
  const diagnosticsCount = matchingDiagnostics.reduce((sum, entry) => sum + entry.total, 0);
  if (diagnosticsCount === 0) return null;

  return {
    diagnosticsCount,
    warnings: matchingDiagnostics
      .slice(0, 3)
      .map(
        (entry) =>
          `Diagnostics: \`${path.relative(cwd, entry.file)}\` (${entry.total} total${entry.errors > 0 ? `, ${entry.errors} errors` : ""}${entry.warnings > 0 ? `, ${entry.warnings} warnings` : ""})`,
      ),
  };
}

/** Append bounded diagnostic Priority Signals to an Orientation document. */
export function appendPrioritySignalsSection(
  lines: string[],
  summary: PrioritySignalsSummary | null,
): void {
  if (!summary || summary.warnings.length === 0) return;
  lines.push("## Priority Signals");
  for (const warning of summary.warnings.slice(0, 3)) {
    lines.push(`- ${warning}`);
  }
  lines.push("");
}

function loadDiagnostics(
  cwd: string,
  lspRuntime: WorkspaceLspRuntimeState,
): Array<{ file: string; total: number; errors: number; warnings: number }> {
  if (lspRuntime.kind !== "ready") return [];
  if (typeof lspRuntime.runtime.getOutstandingDiagnosticSummary !== "function") return [];

  return lspRuntime.runtime.getOutstandingDiagnosticSummary(2).map((entry) => ({
    file: path.resolve(cwd, entry.file),
    total: entry.total,
    errors: entry.errors,
    warnings: entry.warnings,
  }));
}
