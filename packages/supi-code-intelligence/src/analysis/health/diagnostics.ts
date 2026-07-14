// Diagnostics collection and code-action gathering for code_health.
// Extracted from orchestrate.ts.

import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { isWithinOrEqual } from "@mrclrchtr/supi-core/api";
import type { WorkspaceLspRuntime } from "@mrclrchtr/supi-lsp/api";
import type {
  CodeActionSuggestion,
  HealthCodeActions,
  HealthData,
  HealthDiagnosticEntry,
} from "../../session/health-types.ts";
import { createEvidenceList, createPartialEvidenceList } from "../evidence.ts";

// ── Diagnostics ───────────────────────────────────────────────────────

export function isScopedFile(scopeFilter: string | null): scopeFilter is string {
  return scopeFilter !== null && existsSync(scopeFilter) && !isDirectory(scopeFilter);
}

export async function collectDiagnostics(
  service: WorkspaceLspRuntime | null,
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
  service: WorkspaceLspRuntime,
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
  service: WorkspaceLspRuntime,
  scopeFilter: string | null,
  cwd: string,
): HealthDiagnosticEntry[] {
  const summary = service.getWorkspaceDiagnosticSummary();
  const result: HealthDiagnosticEntry[] = [];

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
  service: WorkspaceLspRuntime | null,
  scopeFilter: string | null,
  cwd: string,
): Promise<HealthCodeActions> {
  if (!service) return completeCodeActions([]);

  try {
    const outstanding = service
      .getOutstandingDiagnostics(1)
      .filter((entry) => !scopeFilter || isWithinScope(scopeFilter, entry.file, cwd));
    const queried = outstanding.slice(0, MAX_CODE_ACTION_FILES);
    const collected = await Promise.all(
      queried.map((entry) => collectFileCodeActions(service, entry)),
    );
    const suggestions = dedupeSuggestions(collected.flatMap((result) => result.items));
    const shown = suggestions.slice(0, MAX_CODE_ACTION_SUGGESTIONS);
    const partialReason = collected.some((result) => result.providerLimited)
      ? "provider-limited"
      : outstanding.length > queried.length || suggestions.length > shown.length
        ? "safety-limit"
        : null;
    return partialReason ? partialCodeActions(shown, partialReason) : completeCodeActions(shown);
  } catch {
    return partialCodeActions([], "provider-limited");
  }
}

function completeCodeActions(items: CodeActionSuggestion[]): HealthCodeActions {
  return {
    items,
    evidence: createEvidenceList({ key: "health.codeActions", items }).metadata,
  };
}

function partialCodeActions(
  items: CodeActionSuggestion[],
  partialReason: "safety-limit" | "provider-limited",
): HealthCodeActions {
  return {
    items,
    evidence: createPartialEvidenceList({
      key: "health.codeActions",
      items,
      partialReason,
    }).metadata,
  };
}

function dedupeSuggestions(suggestions: CodeActionSuggestion[]): CodeActionSuggestion[] {
  const seen = new Set<string>();
  return suggestions.filter((suggestion) => {
    const key = `${suggestion.file}:${suggestion.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function collectFileCodeActions(
  service: WorkspaceLspRuntime,
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
): Promise<{ items: CodeActionSuggestion[]; providerLimited: boolean }> {
  const errorDiag = entry.diagnostics.find((d) => (d.severity ?? 1) <= 1);
  if (!errorDiag) return { items: [], providerLimited: false };

  try {
    const actions = await service.codeActions(entry.file, {
      line: errorDiag.range.start.line,
      character: errorDiag.range.start.character,
    });
    if (!actions || actions.length === 0) return { items: [], providerLimited: false };

    const items = actions.flatMap((action) =>
      action.title
        ? [
            {
              file: entry.file,
              line: errorDiag.range.start.line + 1,
              title: action.title,
              kind: action.kind ?? undefined,
            },
          ]
        : [],
    );
    return { items, providerLimited: false };
  } catch {
    return { items: [], providerLimited: true };
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
