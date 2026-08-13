// Diagnostics collection for code_health.
// Extracted from orchestrate.ts.

import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import type { CodeRequestControl } from "@mrclrchtr/supi-code-runtime/api";
import { isWithinOrEqual } from "@mrclrchtr/supi-core/api";
import type { Diagnostic, WorkspaceLspRuntime } from "@mrclrchtr/supi-lsp/api";
import type {
  HealthDiagnosticEntry,
  HealthDiagnosticMessage,
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
  /** Collect individual messages per file (detailed level). */
  readonly detailed?: boolean;
  readonly requestControl?: CodeRequestControl;
}

/** Collect diagnostics without widening the requested evidence scope. */
export async function collectDiagnostics(
  options: CollectDiagnosticsOptions,
): Promise<HealthDiagnosticObservation> {
  const { service, included, scope, cwd, unavailableReason, detailed, requestControl } = options;
  if (!included.includes("diagnostics")) return { kind: "not-requested", entries: [] };
  if (!service) return unavailableDiagnostics(scope, unavailableReason);

  return scope.kind === "file"
    ? collectScopedFileDiagnostics(service, scope, detailed, requestControl)
    : collectTrackedFileDiagnostics(service, scope, cwd, detailed);
}

async function collectScopedFileDiagnostics(
  service: WorkspaceLspRuntime,
  scope: Extract<HealthDiagnosticScope, { kind: "file" }>,
  detailed?: boolean,
  requestControl?: CodeRequestControl,
): Promise<HealthDiagnosticObservation> {
  try {
    const result = await service.fileDiagnostics(scope.path, 4, requestControl);
    if (result.kind === "unavailable") return unavailableDiagnostics(scope, result.reason);

    const entries = toFileDiagnosticEntries(scope.path, result.data, detailed);
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
  detailed?: boolean,
): HealthDiagnosticObservation {
  try {
    const snapshot = detailed
      ? collectWorkspaceDiagnosticsDetailed(service, scope.filter, cwd)
      : collectWorkspaceDiagnostics(service, scope.filter, cwd);
    return snapshot.current
      ? { kind: "completed", scope, entries: snapshot.entries }
      : {
          kind: "partial",
          scope,
          entries: snapshot.entries,
          reason: "Some tracked-file diagnostics were invalidated by a workspace change.",
        };
  } catch (error) {
    return unavailableDiagnostics(
      scope,
      errorMessage(error, "Tracked-file diagnostic snapshot is unavailable."),
    );
  }
}

function toFileDiagnosticEntries(
  file: string,
  diagnostics: ReadonlyArray<Pick<Diagnostic, "severity" | "message" | "source" | "range">>,
  detailed?: boolean,
): HealthDiagnosticEntry[] {
  const errors = diagnostics.filter((diagnostic) => (diagnostic.severity ?? 1) === 1).length;
  const warnings = diagnostics.filter((diagnostic) => (diagnostic.severity ?? 1) === 2).length;
  if (!hasIssueCounts(errors, warnings)) return [];
  const entry: HealthDiagnosticEntry = { file, errors, warnings };
  if (detailed) {
    return [{ ...entry, messages: extractMessages(diagnostics) }];
  }
  return [entry];
}

function collectWorkspaceDiagnostics(
  service: WorkspaceLspRuntime,
  scopeFilter: string | null,
  cwd: string,
): { entries: HealthDiagnosticEntry[]; current: boolean } {
  const summary = service.getWorkspaceDiagnosticSummary();
  const result: HealthDiagnosticEntry[] = [];

  for (const entry of summary.entries) {
    const filePath = resolve(cwd, entry.file);
    if (scopeFilter && !isWithinOrEqual(scopeFilter, filePath)) continue;
    if (!hasIssueCounts(entry.errors, entry.warnings)) continue;
    result.push({ file: filePath, errors: entry.errors, warnings: entry.warnings });
  }

  return { entries: result, current: summary.current };
}

/** Detailed workspace path: full diagnostics with messages, capped per file. */
function collectWorkspaceDiagnosticsDetailed(
  service: WorkspaceLspRuntime,
  scopeFilter: string | null,
  cwd: string,
): { entries: HealthDiagnosticEntry[]; current: boolean } {
  const outstanding = service.getOutstandingDiagnostics(2);
  const result: HealthDiagnosticEntry[] = [];

  for (const { file, diagnostics } of outstanding.entries) {
    const filePath = resolve(cwd, file);
    if (scopeFilter && !isWithinOrEqual(scopeFilter, filePath)) continue;
    const entries = toFileDiagnosticEntries(filePath, diagnostics, true);
    result.push(...entries);
  }

  return { entries: result, current: outstanding.current };
}

// ── Message extraction ────────────────────────────────────────────────

const MAX_MESSAGES_PER_FILE = 3;

function extractMessages(
  diagnostics: ReadonlyArray<Pick<Diagnostic, "severity" | "message" | "source" | "range">>,
): HealthDiagnosticMessage[] {
  const errorsAndWarnings = diagnostics
    .filter((d) => (d.severity ?? 1) <= 2)
    .sort(
      (a, b) => (a.severity ?? 1) - (b.severity ?? 1) || a.range.start.line - b.range.start.line,
    );

  return errorsAndWarnings.slice(0, MAX_MESSAGES_PER_FILE).map((d) => ({
    line: d.range.start.line + 1,
    severity: (d.severity ?? 1) === 1 ? ("error" as const) : ("warning" as const),
    message: typeof d.message === "string" ? d.message : d.message.value,
    ...(d.source ? { source: d.source } : {}),
  }));
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
