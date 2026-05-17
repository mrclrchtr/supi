import * as fs from "node:fs";
import * as path from "node:path";
import { getSessionLspService } from "@mrclrchtr/supi-lsp/api";

export interface PrioritySignalsSummary {
  diagnosticsCount: number;
  lowCoverageCount: number;
  unusedCount: number;
  warnings: string[];
}

interface LoadedSignals {
  diagnostics: Array<{ file: string; total: number; errors: number; warnings: number }>;
  coverageByFile: Map<string, number>;
  unusedFiles: Set<string>;
  unusedExports: Array<{ file: string; name: string }>;
}

export function summarizePrioritySignalsForFiles(
  cwd: string,
  files: Iterable<string>,
): PrioritySignalsSummary | null {
  const loaded = loadPrioritizationSignals(cwd);
  const relevantFiles = new Set([...files].map((file) => path.resolve(cwd, file)));
  if (relevantFiles.size === 0) return null;

  const warnings: string[] = [];

  const matchingDiagnostics = loaded.diagnostics.filter((entry) =>
    relevantFiles.has(path.resolve(entry.file)),
  );
  const diagnosticsCount = matchingDiagnostics.reduce((sum, entry) => sum + entry.total, 0);
  for (const entry of matchingDiagnostics.slice(0, 3)) {
    warnings.push(
      `Diagnostics: \`${path.relative(cwd, entry.file)}\` (${entry.total} total${entry.errors > 0 ? `, ${entry.errors} errors` : ""}${entry.warnings > 0 ? `, ${entry.warnings} warnings` : ""})`,
    );
  }

  const lowCoverage = [...loaded.coverageByFile.entries()]
    .filter(([file, pct]) => relevantFiles.has(path.resolve(file)) && pct < 50)
    .sort((a, b) => a[1] - b[1]);
  for (const [file, pct] of lowCoverage.slice(0, 3)) {
    warnings.push(`Low coverage: \`${path.relative(cwd, file)}\` (${pct.toFixed(0)}%)`);
  }

  const unusedFileMatches = [...loaded.unusedFiles]
    .filter((file) => relevantFiles.has(path.resolve(file)))
    .sort((a, b) => a.localeCompare(b));
  for (const file of unusedFileMatches.slice(0, 3)) {
    warnings.push(`Unused file: \`${path.relative(cwd, file)}\``);
  }

  const unusedExportMatches = loaded.unusedExports
    .filter((entry) => relevantFiles.has(path.resolve(entry.file)))
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of unusedExportMatches.slice(0, 3)) {
    warnings.push(`Unused export: \`${entry.name}\` in \`${path.relative(cwd, entry.file)}\``);
  }

  const summary: PrioritySignalsSummary = {
    diagnosticsCount,
    lowCoverageCount: lowCoverage.length,
    unusedCount: unusedFileMatches.length + unusedExportMatches.length,
    warnings,
  };

  return summary.diagnosticsCount > 0 || summary.lowCoverageCount > 0 || summary.unusedCount > 0
    ? summary
    : null;
}

export function loadPrioritizationSignals(cwd: string): LoadedSignals {
  return {
    diagnostics: loadDiagnostics(cwd),
    coverageByFile: loadCoverageSummary(cwd),
    unusedFiles: loadUnusedFiles(cwd),
    unusedExports: loadUnusedExports(cwd),
  };
}

export function appendPrioritySignalsSection(
  lines: string[],
  summary: PrioritySignalsSummary | null,
): void {
  if (!summary || summary.warnings.length === 0) return;
  lines.push("## Priority Signals");
  for (const warning of summary.warnings.slice(0, 6)) {
    lines.push(`- ${warning}`);
  }
  lines.push("");
}

function loadDiagnostics(
  cwd: string,
): Array<{ file: string; total: number; errors: number; warnings: number }> {
  const lspState = getSessionLspService(cwd);
  if (lspState.kind !== "ready") return [];

  return lspState.service.getOutstandingDiagnosticSummary(2).map((entry) => ({
    file: path.resolve(cwd, entry.file),
    total: entry.total,
    errors: entry.errors,
    warnings: entry.warnings,
  }));
}

function loadCoverageSummary(cwd: string): Map<string, number> {
  const coveragePath = path.join(cwd, "coverage", "coverage-summary.json");
  if (!fs.existsSync(coveragePath)) return new Map();

  try {
    const parsed = JSON.parse(fs.readFileSync(coveragePath, "utf-8")) as Record<string, unknown>;
    const map = new Map<string, number>();
    for (const [file, value] of Object.entries(parsed)) {
      if (file === "total" || typeof value !== "object" || value === null) continue;
      const linesPct = getPct(value, "lines");
      const statementsPct = getPct(value, "statements");
      const pct = Math.min(linesPct ?? 100, statementsPct ?? 100);
      map.set(path.resolve(cwd, file), pct);
    }
    return map;
  } catch {
    return new Map();
  }
}

function loadUnusedFiles(cwd: string): Set<string> {
  const parsed = loadKnipJson(cwd);
  const values = Array.isArray(parsed?.files) ? parsed.files : [];
  const files = values
    .map((value) => toPathString(value))
    .filter((value): value is string => Boolean(value))
    .map((file) => path.resolve(cwd, file));
  return new Set(files);
}

function loadUnusedExports(cwd: string): Array<{ file: string; name: string }> {
  const parsed = loadKnipJson(cwd);
  const values = Array.isArray(parsed?.exports) ? parsed.exports : [];
  const exports: Array<{ file: string; name: string }> = [];

  for (const value of values) {
    if (typeof value === "string") {
      exports.push({ file: path.resolve(cwd, value), name: path.basename(value) });
      continue;
    }
    if (typeof value !== "object" || value === null) continue;
    const record = value as Record<string, unknown>;
    const file = toPathString(record.file) ?? toPathString(record.path);
    const name = typeof record.name === "string" ? record.name : null;
    if (file && name) {
      exports.push({ file: path.resolve(cwd, file), name });
    }
  }

  return exports;
}

function loadKnipJson(cwd: string): Record<string, unknown> | null {
  const knipPath = path.join(cwd, "knip.json");
  if (!fs.existsSync(knipPath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(knipPath, "utf-8"));
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function getPct(value: object, key: string): number | null {
  const candidate = (value as Record<string, unknown>)[key];
  if (typeof candidate !== "object" || candidate === null) return null;
  const pct = (candidate as Record<string, unknown>).pct;
  return typeof pct === "number" ? pct : null;
}

function toPathString(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  return typeof record.file === "string"
    ? record.file
    : typeof record.path === "string"
      ? record.path
      : null;
}
