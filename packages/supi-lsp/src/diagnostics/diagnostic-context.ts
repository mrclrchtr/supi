// Diagnostic context formatting for the LSP extension.
// Extracted from guidance.ts to keep prompt surfaces separate from formatting logic.

import type { Diagnostic } from "../config/types.ts";
import type { OutstandingDiagnosticSummaryEntry } from "../manager/manager-types.ts";
import { splitSuppressionDiagnostics } from "./suppression-diagnostics.ts";

export const MAX_DETAILED_DIAGNOSTICS = 5;
const MAX_DETAIL_LINES_PER_FILE = 3;

interface DetailedDiagnostics {
  file: string;
  diagnostics: Diagnostic[];
}

export function formatDiagnosticsContext(
  diagnostics: OutstandingDiagnosticSummaryEntry[],
  maxFiles: number = 3,
  detailed?: DetailedDiagnostics[],
  staleWarning?: string | null,
): string | null {
  if (diagnostics.length === 0) return null;

  const totalDiags = diagnostics.reduce((sum, d) => sum + d.total, 0);
  const detailMap = buildDetailMap(totalDiags, detailed);

  const lines: string[] = [];
  if (staleWarning) lines.push(staleWarning);
  const visible = diagnostics.slice(0, maxFiles);

  for (const entry of visible) {
    lines.push(`- ${entry.file}: ${formatCounts(entry)}`);
    appendDetailLines(lines, detailMap?.get(entry.file));
  }

  const remaining = diagnostics.length - visible.length;
  if (remaining > 0) {
    lines.push(`- +${remaining} more file${remaining === 1 ? "" : "s"}`);
  }

  appendSuppressionCleanup(
    lines,
    visible.map((entry) => entry.file),
    detailMap,
  );

  return [
    '<extension-context source="supi-lsp">',
    "Outstanding diagnostics — fix these before proceeding:",
    ...lines,
    "</extension-context>",
  ].join("\n");
}

function buildDetailMap(
  totalDiags: number,
  detailed?: DetailedDiagnostics[],
): Map<string, Diagnostic[]> | null {
  if (totalDiags > MAX_DETAILED_DIAGNOSTICS || !detailed || detailed.length === 0) return null;
  return new Map(detailed.map((d) => [d.file, d.diagnostics]));
}

function appendDetailLines(lines: string[], details?: Diagnostic[]): void {
  if (!details) return;
  for (const d of details.slice(0, MAX_DETAIL_LINES_PER_FILE)) {
    const line = d.range.start.line + 1;
    const char = d.range.start.character + 1;
    const source = d.source ? ` ${d.source}` : "";
    lines.push(`  L${line} C${char}${source}: ${d.message}`);
  }
  if (details.length > MAX_DETAIL_LINES_PER_FILE) {
    const extra = details.length - MAX_DETAIL_LINES_PER_FILE;
    lines.push(`  +${extra} more`);
  }
}

function appendSuppressionCleanup(
  lines: string[],
  visibleFiles: string[],
  detailMap: Map<string, Diagnostic[]> | null,
): void {
  if (!detailMap) return;

  const suppressionLines: string[] = [];
  for (const file of visibleFiles) {
    const diagnostics = detailMap.get(file);
    if (!diagnostics) continue;

    const { suppressions } = splitSuppressionDiagnostics(diagnostics, 1);
    if (suppressions.length === 0) continue;

    suppressionLines.push(`- ${file}`);
    appendDetailLines(suppressionLines, suppressions);
  }

  if (suppressionLines.length === 0) return;
  lines.push("", "Stale suppression comments — clean these up:", ...suppressionLines);
}

export function diagnosticsContextFingerprint(content: string | null): string | null {
  return content;
}

function formatCounts(entry: OutstandingDiagnosticSummaryEntry): string {
  const counts: string[] = [];
  if (entry.errors > 0) counts.push(pluralize(entry.errors, "error"));
  if (entry.warnings > 0) counts.push(pluralize(entry.warnings, "warning"));
  if (entry.information > 0) counts.push(pluralize(entry.information, "info"));
  if (entry.hints > 0) counts.push(pluralize(entry.hints, "hint"));
  return counts.join(", ");
}

function pluralize(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}
