import type { OutstandingDiagnosticSummaryEntry } from "./manager-types.ts";
import type { Diagnostic } from "./types.ts";

export function formatDiagnosticsDisplayContent(
  diagnostics: OutstandingDiagnosticSummaryEntry[],
  detailed?: Array<{ file: string; diagnostics: Diagnostic[] }>,
): string {
  const totals = collectDisplayTotals(diagnostics);
  const summary = buildDisplaySummary(totals);

  if (!detailed || detailed.length === 0) return summary;

  const detailLines = buildDisplayDetailLines(detailed);
  return detailLines.length > 0 ? `${summary}\n${detailLines.join("\n")}` : summary;
}

function collectDisplayTotals(
  diagnostics: Array<{ errors: number; warnings: number; information: number; hints: number }>,
) {
  return diagnostics.reduce(
    (acc, d) => ({
      errors: acc.errors + d.errors,
      warnings: acc.warnings + d.warnings,
      information: acc.information + d.information,
      hints: acc.hints + d.hints,
    }),
    { errors: 0, warnings: 0, information: 0, hints: 0 },
  );
}

function buildDisplaySummary(totals: {
  errors: number;
  warnings: number;
  information: number;
  hints: number;
}): string {
  const parts: string[] = [];
  if (totals.errors > 0) parts.push(`${totals.errors} error${totals.errors === 1 ? "" : "s"}`);
  if (totals.warnings > 0)
    parts.push(`${totals.warnings} warning${totals.warnings === 1 ? "" : "s"}`);
  if (totals.information > 0)
    parts.push(`${totals.information} info${totals.information === 1 ? "" : "s"}`);
  if (totals.hints > 0) parts.push(`${totals.hints} hint${totals.hints === 1 ? "" : "s"}`);

  return parts.length > 0
    ? `LSP diagnostics injected (${parts.join(", ")})`
    : "LSP diagnostics injected";
}

function buildDisplayDetailLines(
  detailed: Array<{
    file: string;
    diagnostics: Diagnostic[];
  }>,
): string[] {
  const lines: string[] = [];
  for (const entry of detailed) {
    for (const d of entry.diagnostics.slice(0, 3)) {
      const line = d.range.start.line + 1;
      const source = d.source ? ` ${d.source}` : "";
      lines.push(`   ${entry.file} L${line}${source}: ${d.message}`);
    }
    if (entry.diagnostics.length > 3) {
      lines.push(`   +${entry.diagnostics.length - 3} more`);
    }
  }
  return lines;
}
