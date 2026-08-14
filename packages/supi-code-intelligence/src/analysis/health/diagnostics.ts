// Diagnostics collection for code_health.
// Extracted from orchestrate.ts.

import { existsSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import type { CodeRequestControl } from "@mrclrchtr/supi-code-runtime/api";
import { isWithinOrEqual } from "@mrclrchtr/supi-core/api";
import type {
  Diagnostic,
  DiagnosticEvidenceDocument,
  DiagnosticEvidenceSummary,
  WorkspaceLspRuntime,
} from "@mrclrchtr/supi-lsp/api";
import { mergeDiagnosticEvidence } from "../../diagnostics/evidence.ts";
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
  /** Runtime used for evidence snapshots when semantic operations are unavailable. */
  readonly evidenceService?: WorkspaceLspRuntime | null;
  readonly included: readonly HealthSection[];
  readonly scope: HealthDiagnosticScope;
  readonly cwd: string;
  readonly unavailableReason: string;
  /** Collect individual messages per file (detailed level). */
  readonly detailed?: boolean;
  readonly requestControl?: CodeRequestControl;
  /** Final evidence from an explicit workspace refresh, when one ran. */
  readonly refreshEvidence?: DiagnosticEvidenceSummary;
}

/** Collect diagnostics without widening the requested evidence scope. */
export async function collectDiagnostics(
  options: CollectDiagnosticsOptions,
): Promise<HealthDiagnosticObservation> {
  const { service, included, scope, cwd, unavailableReason, detailed, requestControl } = options;
  if (!included.includes("diagnostics")) return { kind: "not-requested", entries: [] };
  if (!service) {
    return unavailableDiagnostics(
      scope,
      unavailableReason,
      unavailableScopeEvidence(scope, options.refreshEvidence, options.evidenceService, cwd),
    );
  }

  return scope.kind === "file"
    ? collectScopedFileDiagnostics(service, scope, detailed, requestControl)
    : collectTrackedFileDiagnostics({
        service,
        scope,
        cwd,
        detailed,
        refreshEvidence: options.refreshEvidence,
      });
}

async function collectScopedFileDiagnostics(
  service: WorkspaceLspRuntime,
  scope: Extract<HealthDiagnosticScope, { kind: "file" }>,
  detailed?: boolean,
  requestControl?: CodeRequestControl,
): Promise<HealthDiagnosticObservation> {
  try {
    const result = await service.fileDiagnostics(scope.path, 4, requestControl);
    if (result.kind === "unavailable") {
      return unavailableDiagnostics(scope, result.reason, unavailableFileEvidence(scope.path));
    }

    const entries = toFileDiagnosticEntries(scope.path, result.data, detailed);
    return result.kind === "partial"
      ? {
          kind: "partial",
          scope,
          entries,
          evidence: singleFileEvidence(scope.path, "unconfirmed"),
          reason: result.reason,
        }
      : {
          kind: "completed",
          scope,
          entries,
          evidence: singleFileEvidence(scope.path, "confirmed"),
        };
  } catch (error) {
    return unavailableDiagnostics(
      scope,
      errorMessage(error, "File diagnostic request failed."),
      unavailableFileEvidence(scope.path),
    );
  }
}

interface TrackedFileDiagnosticOptions {
  readonly service: WorkspaceLspRuntime;
  readonly scope: Extract<HealthDiagnosticScope, { kind: "tracked-files" }>;
  readonly cwd: string;
  readonly detailed?: boolean;
  readonly refreshEvidence?: DiagnosticEvidenceSummary;
}

function collectTrackedFileDiagnostics(
  options: TrackedFileDiagnosticOptions,
): HealthDiagnosticObservation {
  const { service, scope, cwd, detailed, refreshEvidence } = options;
  try {
    const snapshot = detailed
      ? collectWorkspaceDiagnosticsDetailed(service, scope.filter, cwd)
      : collectWorkspaceDiagnostics(service, scope.filter, cwd);
    const sourceEvidence = mergeEvidence(refreshEvidence, snapshot.evidence, cwd);
    const scopedEvidence = selectTrackedFileEvidence(sourceEvidence, scope.filter, cwd);
    const evidence = ensureEvidenceCoversEntries(scopedEvidence, snapshot.entries, cwd);
    return evidenceIsComplete(evidence, snapshot.entries.length > 0, snapshot.current)
      ? { kind: "completed", scope, entries: snapshot.entries, evidence }
      : {
          kind: "partial",
          scope,
          entries: snapshot.entries,
          evidence,
          reason: diagnosticEvidenceReason(evidence),
        };
  } catch (error) {
    const evidence = options.refreshEvidence
      ? selectTrackedFileEvidence(options.refreshEvidence, scope.filter, cwd)
      : emptyEvidence();
    return unavailableDiagnostics(
      scope,
      errorMessage(error, "Tracked-file diagnostic snapshot is unavailable."),
      evidence,
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
): {
  entries: HealthDiagnosticEntry[];
  current: boolean;
  evidence: DiagnosticEvidenceSummary;
} {
  const summary = service.getWorkspaceDiagnosticSummary();
  const result: HealthDiagnosticEntry[] = [];

  for (const entry of summary.entries) {
    const filePath = resolve(cwd, entry.file);
    if (scopeFilter && !isWithinOrEqual(scopeFilter, filePath)) continue;
    if (!hasIssueCounts(entry.errors, entry.warnings)) continue;
    result.push({ file: filePath, errors: entry.errors, warnings: entry.warnings });
  }

  return { entries: result, current: summary.current, evidence: summary.evidence };
}

/** Detailed workspace path: full diagnostics with messages, capped per file. */
function collectWorkspaceDiagnosticsDetailed(
  service: WorkspaceLspRuntime,
  scopeFilter: string | null,
  cwd: string,
): {
  entries: HealthDiagnosticEntry[];
  current: boolean;
  evidence: DiagnosticEvidenceSummary;
} {
  const outstanding = service.getOutstandingDiagnostics(2);
  const result: HealthDiagnosticEntry[] = [];

  for (const { file, diagnostics } of outstanding.entries) {
    const filePath = resolve(cwd, file);
    if (scopeFilter && !isWithinOrEqual(scopeFilter, filePath)) continue;
    const entries = toFileDiagnosticEntries(filePath, diagnostics, true);
    result.push(...entries);
  }

  return { entries: result, current: outstanding.current, evidence: outstanding.evidence };
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

function unavailableScopeEvidence(
  scope: HealthDiagnosticScope,
  refreshEvidence: DiagnosticEvidenceSummary | undefined,
  evidenceService: WorkspaceLspRuntime | null | undefined,
  cwd: string,
): DiagnosticEvidenceSummary {
  const runtimeEvidence = readRuntimeEvidence(evidenceService);
  const knownEvidence = refreshEvidence
    ? mergeDiagnosticEvidence(refreshEvidence, runtimeEvidence, cwd, "conservative")
    : runtimeEvidence;
  if (knownEvidence.requested === 0 && knownEvidence.documents.length === 0) {
    return scope.kind === "file" ? unavailableFileEvidence(scope.path) : emptyEvidence();
  }
  const scoped = selectTrackedFileEvidence(
    knownEvidence,
    scope.kind === "file" ? scope.path : scope.filter,
    cwd,
  );
  if (scoped.requested > 0) return scoped;
  return scope.kind === "file" ? unavailableFileEvidence(scope.path) : scoped;
}

function unavailableFileEvidence(file: string): DiagnosticEvidenceSummary {
  return singleFileEvidence(file, existsSync(file) ? "failed" : "removed");
}

function readRuntimeEvidence(
  service: WorkspaceLspRuntime | null | undefined,
): DiagnosticEvidenceSummary {
  if (!service) return emptyEvidence();
  try {
    return service.getWorkspaceDiagnosticSummary().evidence;
  } catch {
    return emptyEvidence();
  }
}

function unavailableDiagnostics(
  scope: HealthDiagnosticScope,
  reason: string,
  evidence: DiagnosticEvidenceSummary = emptyEvidence(),
): HealthDiagnosticObservation {
  return { kind: "unavailable", scope, entries: [], evidence, reason };
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function hasIssueCounts(errors: number, warnings: number): boolean {
  return errors > 0 || warnings > 0;
}

function emptyEvidence(): DiagnosticEvidenceSummary {
  return {
    requested: 0,
    confirmed: 0,
    unconfirmed: 0,
    failed: 0,
    removed: 0,
    documents: [],
  };
}

function singleFileEvidence(
  file: string,
  status: DiagnosticEvidenceDocument["status"],
): DiagnosticEvidenceSummary {
  return {
    requested: 1,
    confirmed: status === "confirmed" ? 1 : 0,
    unconfirmed: status === "unconfirmed" ? 1 : 0,
    failed: status === "failed" ? 1 : 0,
    removed: status === "removed" ? 1 : 0,
    documents: [{ file, status }],
  };
}

function mergeEvidence(
  refreshEvidence: DiagnosticEvidenceSummary | undefined,
  snapshotEvidence: DiagnosticEvidenceSummary,
  cwd: string,
): DiagnosticEvidenceSummary {
  return refreshEvidence
    ? mergeDiagnosticEvidence(refreshEvidence, snapshotEvidence, cwd, "conservative")
    : snapshotEvidence;
}

function selectTrackedFileEvidence(
  evidence: DiagnosticEvidenceSummary,
  scopeFilter: string | null,
  cwd: string,
): DiagnosticEvidenceSummary {
  if (evidence.documents.length === 0) return evidence;

  const documents = evidence.documents.filter((document) => {
    if (scopeFilter === null) return true;
    return isWithinOrEqual(scopeFilter, resolve(cwd, document.file));
  });
  return summarizeEvidence(documents);
}

function ensureEvidenceCoversEntries(
  evidence: DiagnosticEvidenceSummary,
  entries: readonly HealthDiagnosticEntry[],
  cwd: string,
): DiagnosticEvidenceSummary {
  if (entries.length === 0) return evidence;
  const documents = [...evidence.documents];
  const knownFiles = new Set(documents.map((document) => resolve(cwd, document.file)));
  for (const entry of entries) {
    const file = resolve(cwd, entry.file);
    if (knownFiles.has(file)) continue;
    knownFiles.add(file);
    documents.push({ file: relative(cwd, file), status: "unconfirmed" });
  }
  return summarizeEvidence(documents);
}

function summarizeEvidence(
  documents: readonly DiagnosticEvidenceDocument[],
): DiagnosticEvidenceSummary {
  const counts = {
    requested: documents.length,
    confirmed: 0,
    unconfirmed: 0,
    failed: 0,
    removed: 0,
  };
  for (const document of documents) counts[document.status]++;
  return { ...counts, documents: [...documents] };
}

function evidenceIsComplete(
  evidence: DiagnosticEvidenceSummary,
  hasDiagnosticEntries: boolean,
  snapshotCurrent: boolean,
): boolean {
  if (!snapshotCurrent && evidence.requested === 0) return false;
  if (evidence.requested === 0) return !hasDiagnosticEntries;
  return (
    evidence.confirmed === evidence.requested &&
    evidence.unconfirmed === 0 &&
    evidence.failed === 0 &&
    evidence.removed === 0
  );
}

function diagnosticEvidenceReason(evidence: DiagnosticEvidenceSummary): string {
  return `Diagnostic evidence is partial: ${evidence.requested} requested, ${evidence.confirmed} confirmed, ${evidence.unconfirmed} unconfirmed, ${evidence.failed} failed, ${evidence.removed} removed.`;
}

export function isDirectory(filePath: string): boolean {
  try {
    return statSync(filePath).isDirectory();
  } catch {
    return false;
  }
}
