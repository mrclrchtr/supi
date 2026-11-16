// Diagnostics collection for code_health.
// Extracted from orchestrate.ts.

import { existsSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import type { CodeRequestControl } from "@mrclrchtr/supi-code-runtime/api";
import { isWithinOrEqual } from "@mrclrchtr/supi-core/api";
import type {
  DiagnosticEvidenceDocument,
  DiagnosticEvidenceSummary,
  WorkspaceDiagnosticReport,
  WorkspaceLspRuntime,
} from "@mrclrchtr/supi-lsp/api";
import { allRequestedFilesConfirmed } from "../../diagnostics/coverage.ts";
import { mergeDiagnosticEvidence } from "../../diagnostics/evidence.ts";
import type {
  HealthDiagnosticEntry,
  HealthDiagnosticObservation,
  HealthDiagnosticScope,
  HealthSection,
} from "../../session/health-types.ts";
import { diagnosticEvidenceReason } from "./evidence-reason.ts";
import {
  collectScopedFileDiagnostics,
  fileScopeStatus,
  toFileDiagnosticEntries,
  unavailableDiagnostics,
  unavailableFileEvidence,
} from "./file-scope.ts";

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
  /** Evidence from an explicit workspace refresh, when one ran. */
  readonly refreshEvidence?: DiagnosticEvidenceSummary;
  /** Coherent final report from an explicit workspace refresh, when one ran. */
  readonly refreshReport?: WorkspaceDiagnosticReport;
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
      unavailableScopeEvidence({
        scope,
        refreshEvidence: options.refreshEvidence,
        refreshReport: options.refreshReport,
        evidenceService: options.evidenceService,
        cwd,
      }),
      scope.kind === "file" ? fileScopeStatus(scope.path, cwd) : undefined,
    );
  }

  return scope.kind === "file"
    ? collectScopedFileDiagnostics({ service, scope, cwd, detailed, requestControl })
    : collectTrackedFileDiagnostics({
        service,
        scope,
        cwd,
        detailed,
        refreshEvidence: options.refreshEvidence,
        refreshReport: options.refreshReport,
      });
}

interface TrackedFileDiagnosticOptions {
  readonly service: WorkspaceLspRuntime;
  readonly scope: Extract<HealthDiagnosticScope, { kind: "tracked-files" }>;
  readonly cwd: string;
  readonly detailed?: boolean;
  readonly refreshEvidence?: DiagnosticEvidenceSummary;
  readonly refreshReport?: WorkspaceDiagnosticReport;
}

function collectTrackedFileDiagnostics(
  options: TrackedFileDiagnosticOptions,
): HealthDiagnosticObservation {
  const { service, scope, cwd, detailed, refreshEvidence, refreshReport } = options;
  try {
    const snapshot = detailed
      ? collectWorkspaceDiagnosticsDetailed(service, scope.filter, cwd, refreshReport)
      : collectWorkspaceDiagnostics(service, scope.filter, cwd, refreshReport);
    const sourceEvidence = refreshReport
      ? withRefreshRemovals(snapshot.evidence, refreshEvidence, cwd)
      : mergeEvidence(refreshEvidence, snapshot.evidence, cwd);
    const retainedEvidence = withRetainedRemovals(
      sourceEvidence,
      service.peekRemovedTrackedFiles(scope.filter),
      cwd,
    );
    const scopedEvidence = selectTrackedFileEvidence(retainedEvidence, scope.filter, cwd);
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
    const evidenceSource = options.refreshReport?.summary.evidence ?? options.refreshEvidence;
    const evidence = evidenceSource
      ? selectTrackedFileEvidence(evidenceSource, scope.filter, cwd)
      : emptyEvidence();
    return unavailableDiagnostics(
      scope,
      errorMessage(error, "Tracked-file diagnostic snapshot is unavailable."),
      evidence,
    );
  }
}

function collectWorkspaceDiagnostics(
  service: WorkspaceLspRuntime,
  scopeFilter: string | null,
  cwd: string,
  report?: WorkspaceDiagnosticReport,
): {
  entries: HealthDiagnosticEntry[];
  current: boolean;
  evidence: DiagnosticEvidenceSummary;
} {
  const summary = report?.summary ?? service.getWorkspaceDiagnosticSummary();
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
  report?: WorkspaceDiagnosticReport,
): {
  entries: HealthDiagnosticEntry[];
  current: boolean;
  evidence: DiagnosticEvidenceSummary;
} {
  const outstanding = report?.outstanding ?? service.getOutstandingDiagnostics(2);
  const result: HealthDiagnosticEntry[] = [];

  for (const { file, diagnostics } of outstanding.entries) {
    const filePath = resolve(cwd, file);
    if (scopeFilter && !isWithinOrEqual(scopeFilter, filePath)) continue;
    const entries = toFileDiagnosticEntries(filePath, diagnostics, true);
    result.push(...entries);
  }

  return { entries: result, current: outstanding.current, evidence: outstanding.evidence };
}

interface UnavailableScopeEvidenceOptions {
  readonly scope: HealthDiagnosticScope;
  readonly refreshEvidence?: DiagnosticEvidenceSummary;
  readonly refreshReport?: WorkspaceDiagnosticReport;
  readonly evidenceService?: WorkspaceLspRuntime | null;
  readonly cwd: string;
}

function unavailableScopeEvidence(
  options: UnavailableScopeEvidenceOptions,
): DiagnosticEvidenceSummary {
  const { scope, refreshEvidence, refreshReport, evidenceService, cwd } = options;
  const runtimeEvidence = refreshReport?.summary.evidence ?? readRuntimeEvidence(evidenceService);
  const knownEvidence = refreshReport
    ? runtimeEvidence
    : refreshEvidence
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

function mergeEvidence(
  refreshEvidence: DiagnosticEvidenceSummary | undefined,
  snapshotEvidence: DiagnosticEvidenceSummary,
  cwd: string,
): DiagnosticEvidenceSummary {
  return refreshEvidence
    ? mergeDiagnosticEvidence(refreshEvidence, snapshotEvidence, cwd, "conservative")
    : snapshotEvidence;
}

/**
 * Carry removed documents from refresh evidence into a coherent refresh report.
 *
 * The report is captured after `pruneMissingFiles()`, so files deleted before the refresh are
 * absent from it; only the refresh evidence records them. Removal is terminal, so adding those
 * documents cannot mix report generations. Files the report still tracks keep their report status.
 */
function withRefreshRemovals(
  reportEvidence: DiagnosticEvidenceSummary,
  refreshEvidence: DiagnosticEvidenceSummary | undefined,
  cwd: string,
): DiagnosticEvidenceSummary {
  const removed = refreshEvidence?.documents.filter((document) => document.status === "removed");
  if (!removed || removed.length === 0) return reportEvidence;
  const reported = new Set(reportEvidence.documents.map((document) => resolve(cwd, document.file)));
  const added = removed.filter((document) => !reported.has(resolve(cwd, document.file)));
  if (added.length === 0) return reportEvidence;
  return {
    ...reportEvidence,
    requested: reportEvidence.requested + added.length,
    removed: reportEvidence.removed + added.length,
    documents: [...reportEvidence.documents, ...added],
  };
}

/**
 * Add tracked files that the runtime retained as removed since a report last showed them.
 *
 * Passive reads and background server refreshes clear deleted files from the live snapshot, so
 * the retained record is what keeps a removal visible until a report delivers it (#606).
 */
function withRetainedRemovals(
  evidence: DiagnosticEvidenceSummary,
  removedFiles: readonly string[],
  cwd: string,
): DiagnosticEvidenceSummary {
  if (removedFiles.length === 0) return evidence;
  const reported = new Set(evidence.documents.map((document) => resolve(cwd, document.file)));
  const added = removedFiles
    .filter((file) => !reported.has(resolve(cwd, file)))
    .map((file) => ({ file: relative(cwd, resolve(cwd, file)), status: "removed" as const }));
  if (added.length === 0) return evidence;
  return summarizeEvidence([...evidence.documents, ...added]);
}

/** Return absolute paths of files an observation reported as removed. */
export function reportedRemovedFiles(
  observation: HealthDiagnosticObservation,
  cwd: string,
): string[] {
  if (observation.kind === "not-requested") return [];
  return observation.evidence.documents
    .filter((document) => document.status === "removed")
    .map((document) => resolve(cwd, document.file));
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
  return allRequestedFilesConfirmed(evidence);
}

export function isDirectory(filePath: string): boolean {
  try {
    return statSync(filePath).isDirectory();
  } catch {
    return false;
  }
}
