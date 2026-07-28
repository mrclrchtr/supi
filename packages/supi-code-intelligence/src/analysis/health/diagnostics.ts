// Diagnostics collection for code_health.
// Extracted from orchestrate.ts.

import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { isWithinOrEqual } from "@mrclrchtr/supi-core/api";
import type { WorkspaceLspRuntime } from "@mrclrchtr/supi-lsp/api";
import type { HealthData, HealthDiagnosticEntry } from "../../session/health-types.ts";

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

export function isDirectory(filePath: string): boolean {
  try {
    return statSync(filePath).isDirectory();
  } catch {
    return false;
  }
}
