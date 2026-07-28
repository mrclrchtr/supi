// Diagnostics collection for code_health.
// Extracted from orchestrate.ts.

import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { isWithinOrEqual } from "@mrclrchtr/supi-core/api";
import type { WorkspaceLspRuntime } from "@mrclrchtr/supi-lsp/api";
import type {
  HealthDiagnosticEntry,
  HealthDiagnosticObservation,
  HealthDiagnosticScope,
  HealthSection,
} from "../../session/health-types.ts";

// ── Diagnostics ───────────────────────────────────────────────────────

export function isScopedFile(scopeFilter: string | null): scopeFilter is string {
  return scopeFilter !== null && existsSync(scopeFilter) && !isDirectory(scopeFilter);
}

/** Describe exactly what a health diagnostic observation can establish. */
export function diagnosticScope(scopeFilter: string | null): HealthDiagnosticScope {
  return isScopedFile(scopeFilter)
    ? { kind: "file", path: scopeFilter }
    : { kind: "tracked-files", filter: scopeFilter };
}

interface CollectDiagnosticsOptions {
  readonly service: WorkspaceLspRuntime | null;
  readonly included: readonly HealthSection[];
  readonly scope: HealthDiagnosticScope;
  readonly cwd: string;
  readonly unavailableReason: string;
}

/** Collect diagnostics without widening the requested evidence scope. */
export async function collectDiagnostics(
  options: CollectDiagnosticsOptions,
): Promise<HealthDiagnosticObservation> {
  const { service, included, scope, cwd, unavailableReason } = options;
  if (!included.includes("diagnostics")) return { kind: "not-requested", entries: [] };
  if (!service) return unavailableDiagnostics(scope, unavailableReason);

  return scope.kind === "file"
    ? collectScopedFileDiagnostics(service, scope)
    : collectTrackedFileDiagnostics(service, scope, cwd);
}

async function collectScopedFileDiagnostics(
  service: WorkspaceLspRuntime,
  scope: Extract<HealthDiagnosticScope, { kind: "file" }>,
): Promise<HealthDiagnosticObservation> {
  try {
    const result = await service.fileDiagnostics(scope.path, 4);
    if (result.kind === "unavailable") return unavailableDiagnostics(scope, result.reason);

    const entries = toFileDiagnosticEntries(scope.path, result.data);
    return result.kind === "partial"
      ? { kind: "partial", scope, entries, reason: result.reason }
      : { kind: "completed", scope, entries };
  } catch (error) {
    return unavailableDiagnostics(scope, errorMessage(error, "File diagnostic request failed."));
  }
}

function collectTrackedFileDiagnostics(
  service: WorkspaceLspRuntime,
  scope: Extract<HealthDiagnosticScope, { kind: "tracked-files" }>,
  cwd: string,
): HealthDiagnosticObservation {
  try {
    const entries = collectWorkspaceDiagnostics(service, scope.filter, cwd);
    return { kind: "completed", scope, entries };
  } catch (error) {
    return unavailableDiagnostics(
      scope,
      errorMessage(error, "Tracked-file diagnostic snapshot is unavailable."),
    );
  }
}

function toFileDiagnosticEntries(
  file: string,
  diagnostics: ReadonlyArray<{ severity?: number }>,
): HealthDiagnosticEntry[] {
  const errors = diagnostics.filter((diagnostic) => (diagnostic.severity ?? 1) === 1).length;
  const warnings = diagnostics.filter((diagnostic) => (diagnostic.severity ?? 1) === 2).length;
  return hasIssueCounts(errors, warnings) ? [{ file, errors, warnings }] : [];
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

function unavailableDiagnostics(
  scope: HealthDiagnosticScope,
  reason: string,
): HealthDiagnosticObservation {
  return { kind: "unavailable", scope, entries: [], reason };
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
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
