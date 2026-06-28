// Diagnostics collection and code-action gathering for code_health.
// Extracted from orchestrate.ts.

import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { isWithinOrEqual } from "@mrclrchtr/supi-core/api";
import type { SessionLspService } from "@mrclrchtr/supi-lsp/api";
import type { CodeActionSuggestion, HealthData } from "../markdown.ts";

// ── Diagnostics ───────────────────────────────────────────────────────

export function isScopedFile(scopeFilter: string | null): scopeFilter is string {
  return scopeFilter !== null && existsSync(scopeFilter) && !isDirectory(scopeFilter);
}

export async function collectDiagnostics(
  service: SessionLspService | null,
  included: string[],
  scopeFilter: string | null,
  cwd: string,
): Promise<HealthData["diagnostics"]> {
  if (!included.includes("diagnostics") || !service) return [];

  if (isScopedFile(scopeFilter)) {
    return collectScopedFileDiagnostics(service, scopeFilter);
  }

  return collectWorkspaceDiagnostics(service, scopeFilter, cwd);
}

async function collectScopedFileDiagnostics(
  service: SessionLspService,
  scopeFilter: string,
): Promise<HealthData["diagnostics"]> {
  const diags = await service.fileDiagnostics(scopeFilter, 4);
  if (!diags || diags.length === 0) {
    return [];
  }

  const errors = diags.filter((d) => (d.severity ?? 1) === 1).length;
  const warnings = diags.filter((d) => (d.severity ?? 1) === 2).length;
  if (!hasIssueCounts(errors, warnings)) {
    return [];
  }

  return [{ file: scopeFilter, errors, warnings }];
}

function collectWorkspaceDiagnostics(
  service: SessionLspService,
  scopeFilter: string | null,
  cwd: string,
): HealthData["diagnostics"] {
  const summary = service.getWorkspaceDiagnosticSummary();
  const result: HealthData["diagnostics"] = [];

  for (const entry of summary) {
    const filePath = resolve(cwd, entry.file);
    if (scopeFilter && !isWithinOrEqual(scopeFilter, filePath)) continue;
    if (!hasIssueCounts(entry.errors, entry.warnings)) continue;
    result.push({ file: filePath, errors: entry.errors, warnings: entry.warnings });
  }

  return result;
}

function hasIssueCounts(errors: number, warnings: number): boolean {
  return errors > 0 || warnings > 0;
}

// ── Code actions ──────────────────────────────────────────────────────

/** Max files to query for code actions in detailed health mode. */
const MAX_CODE_ACTION_FILES = 5;
/** Max total code action suggestions to return. */
const MAX_CODE_ACTION_SUGGESTIONS = 10;

export async function collectCodeActions(
  service: SessionLspService | null,
  scopeFilter: string | null,
  cwd: string,
): Promise<CodeActionSuggestion[]> {
  if (!service) return [];

  try {
    const outstanding = service.getOutstandingDiagnostics(1);
    const suggestions = await collectFromOutstanding(service, outstanding, scopeFilter, cwd);
    return suggestions.slice(0, MAX_CODE_ACTION_SUGGESTIONS);
  } catch {
    return [];
  }
}

async function collectFromOutstanding(
  service: SessionLspService,
  outstanding: ReturnType<SessionLspService["getOutstandingDiagnostics"]>,
  scopeFilter: string | null,
  cwd: string,
): Promise<CodeActionSuggestion[]> {
  const suggestions: CodeActionSuggestion[] = [];
  let filesQueried = 0;

  for (const entry of outstanding) {
    if (suggestions.length >= MAX_CODE_ACTION_SUGGESTIONS) break;
    if (filesQueried >= MAX_CODE_ACTION_FILES) break;
    if (scopeFilter && !isWithinScope(scopeFilter, entry.file, cwd)) continue;

    const newSuggestions = await collectFileCodeActions(service, entry);
    if (newSuggestions.length === 0) continue;

    filesQueried++;
    mergeSuggestions(suggestions, newSuggestions);
  }

  return suggestions;
}

function mergeSuggestions(
  existing: CodeActionSuggestion[],
  incoming: CodeActionSuggestion[],
): void {
  const seen = new Set(existing.map((s) => `${s.file}:${s.title}`));
  for (const s of incoming) {
    const key = `${s.file}:${s.title}`;
    if (!seen.has(key)) {
      seen.add(key);
      existing.push(s);
    }
  }
}

async function collectFileCodeActions(
  service: SessionLspService,
  entry: {
    file: string;
    diagnostics: Array<{
      severity?: number;
      range: {
        start: { line: number; character: number };
        end: { line: number; character: number };
      };
    }>;
  },
): Promise<CodeActionSuggestion[]> {
  const errorDiag = entry.diagnostics.find((d) => (d.severity ?? 1) <= 1);
  if (!errorDiag) return [];

  try {
    const actions = await service.codeActions(entry.file, {
      line: errorDiag.range.start.line,
      character: errorDiag.range.start.character,
    });
    if (!actions || actions.length === 0) return [];

    const result: CodeActionSuggestion[] = [];
    for (const a of actions) {
      if (!a.title) continue;
      result.push({
        file: entry.file,
        line: errorDiag.range.start.line + 1,
        title: a.title,
        kind: a.kind ?? undefined,
      });
    }
    return result;
  } catch {
    return [];
  }
}

function isWithinScope(scopeFilter: string, file: string, cwd: string): boolean {
  const absPath = resolve(cwd, file);
  return isWithinOrEqual(scopeFilter, absPath);
}

export function isDirectory(filePath: string): boolean {
  try {
    return statSync(filePath).isDirectory();
  } catch {
    return false;
  }
}
