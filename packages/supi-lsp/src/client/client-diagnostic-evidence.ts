// biome-ignore-all lint/style/noExcessiveLinesPerFile: Diagnostic validation and evidence application stay together.
import {
  type CodeQueryResult,
  partialCodeQuery,
  unavailableCodeQuery,
} from "@mrclrchtr/supi-code-runtime/api";
import type {
  Diagnostic,
  DocumentDiagnosticReport,
  PublishDiagnosticsParams,
} from "../config/types.ts";

/** Validate one untrusted LSP diagnostic publication before it enters the cache. */
export function isValidPublishDiagnosticsParams(value: unknown): value is PublishDiagnosticsParams {
  if (!isRecord(value) || !isValidUri(value.uri)) return false;
  if (value.version !== undefined && !isInteger(value.version)) return false;
  return Array.isArray(value.diagnostics) && value.diagnostics.every(isValidDiagnostic);
}

/** Validate one untrusted LSP pull report before it enters the cache. */
export function isValidDocumentDiagnosticReport(
  value: unknown,
  allowRelatedDocuments = true,
): value is DocumentDiagnosticReport {
  if (!isRecord(value)) return false;
  // gopls v0.23.0 ships a non-conforming pull report with an empty `kind`
  // discriminator and no resultId (upstream work in progress). Treat a
  // missing/empty kind with an items array as a full report; every other
  // kind value stays strict.
  if (value.kind === "full" || value.kind === undefined || value.kind === "") {
    if (!Array.isArray(value.items) || !value.items.every(isValidDiagnostic)) return false;
    if (value.resultId !== undefined && typeof value.resultId !== "string") return false;
  } else if (value.kind === "unchanged") {
    if (typeof value.resultId !== "string") return false;
  } else {
    return false;
  }
  return allowRelatedDocuments
    ? isValidRelatedDocuments(value.relatedDocuments)
    : value.relatedDocuments === undefined;
}

function isValidRelatedDocuments(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  return Object.entries(value).every(
    ([uri, report]) => isValidUri(uri) && isValidDocumentDiagnosticReport(report, false),
  );
}

function isValidDiagnostic(value: unknown): value is Diagnostic {
  if (!isRecord(value) || !isValidRange(value.range) || !isValidDiagnosticMessage(value.message)) {
    return false;
  }
  return (
    isValidOptionalSeverity(value.severity) &&
    isValidOptionalCode(value.code) &&
    isValidOptionalCodeDescription(value.codeDescription, value.code) &&
    isValidOptionalSource(value.source) &&
    isValidOptionalTags(value.tags) &&
    isValidOptionalRelatedInformation(value.relatedInformation)
  );
}

function isValidOptionalSeverity(value: unknown): boolean {
  return value === undefined || isDiagnosticSeverity(value);
}

function isValidOptionalCode(value: unknown): boolean {
  return value === undefined || isInteger(value) || typeof value === "string";
}

function isValidOptionalCodeDescription(value: unknown, code: unknown): boolean {
  return value === undefined || (code !== undefined && isRecord(value) && isValidUri(value.href));
}

function isValidOptionalSource(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function isValidOptionalTags(value: unknown): boolean {
  return (
    value === undefined || (Array.isArray(value) && value.every((tag) => tag === 1 || tag === 2))
  );
}

function isValidOptionalRelatedInformation(value: unknown): boolean {
  return (
    value === undefined ||
    (Array.isArray(value) && value.every(isValidDiagnosticRelatedInformation))
  );
}

function isValidDiagnosticMessage(value: unknown): boolean {
  if (typeof value === "string") return true;
  return (
    isRecord(value) &&
    (value.kind === "plaintext" || value.kind === "markdown") &&
    typeof value.value === "string"
  );
}

function isValidDiagnosticRelatedInformation(value: unknown): boolean {
  return isRecord(value) && isValidLocation(value.location) && typeof value.message === "string";
}

function isValidLocation(value: unknown): boolean {
  return isRecord(value) && isValidUri(value.uri) && isValidRange(value.range);
}

function isValidRange(value: unknown): value is {
  start: { line: number; character: number };
  end: { line: number; character: number };
} {
  if (!isRecord(value) || !isValidPosition(value.start) || !isValidPosition(value.end)) {
    return false;
  }
  return (
    value.start.line < value.end.line ||
    (value.start.line === value.end.line && value.start.character <= value.end.character)
  );
}

function isValidPosition(value: unknown): value is { line: number; character: number } {
  return (
    isRecord(value) &&
    isInteger(value.line) &&
    value.line >= 0 &&
    value.line <= 2_147_483_647 &&
    isInteger(value.character) &&
    value.character >= 0 &&
    value.character <= 2_147_483_647
  );
}

function isValidUri(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  try {
    return new URL(value).protocol.length > 0;
  } catch {
    return false;
  }
}

function isDiagnosticSeverity(value: unknown): boolean {
  return value === 1 || value === 2 || value === 3 || value === 4;
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Evidence source that established or observed one cached diagnostic set. */
export type DiagnosticEvidenceSource = "pull" | "typescript" | "push";

/** Stored diagnostic data and the protocol evidence that established it. */
export interface DiagnosticCacheEntry {
  diagnostics: Diagnostic[];
  receivedAt: number;
  source: DiagnosticEvidenceSource;
  synchronizationId?: number;
  evidenceRevision?: number;
  version?: number;
  resultId?: string;
  /**
   * Number of ambient publications retained for compatibility with existing
   * telemetry. Publication count never establishes confirmation.
   */
  publications?: number;
}

/**
 * Test whether one entry came from ambient push observation.
 *
 * Push publication count is not a completion contract. Every push stays
 * tentative until a request-based evidence source replaces it.
 */
export function isTentativePushEntry(entry: DiagnosticCacheEntry | undefined): boolean {
  return entry?.source === "push";
}

/** One document synchronization that needs current diagnostic evidence. */
export interface DiagnosticSynchronization {
  readonly uri: string;
  readonly synchronizationId: number;
  readonly evidenceRevision?: number;
}

/** Monotonic document version state retained across close and reopen. */
export type DocumentVersionHistory = Map<string, number>;

/** Allocate the next document version for one URI. */
export function nextDocumentVersion(history: DocumentVersionHistory, uri: string): number {
  const version = (history.get(uri) ?? 0) + 1;
  history.set(uri, version);
  return version;
}

/** Test whether a synchronization still names the open document state. */
export function isCurrentSynchronization(
  openDocs: ReadonlyMap<string, { synchronizationId: number; evidenceRevision?: number }>,
  synchronization: DiagnosticSynchronization,
): boolean {
  const document = openDocs.get(synchronization.uri);
  return Boolean(
    document?.synchronizationId === synchronization.synchronizationId &&
      (synchronization.evidenceRevision === undefined ||
        document.evidenceRevision === synchronization.evidenceRevision),
  );
}

/**
 * Test whether stored evidence matches a synchronization without a
 * confirmation gate. A tentative push matches here but cannot confirm.
 */
export function hasCurrentEvidence(
  store: ReadonlyMap<string, DiagnosticCacheEntry>,
  synchronization: DiagnosticSynchronization,
  currentEvidenceRevision?: number,
): boolean {
  const entry = store.get(synchronization.uri);
  return Boolean(
    entry &&
      entry.synchronizationId === synchronization.synchronizationId &&
      (synchronization.evidenceRevision === undefined ||
        entry.evidenceRevision === synchronization.evidenceRevision) &&
      (currentEvidenceRevision === undefined || entry.evidenceRevision === currentEvidenceRevision),
  );
}

/** Test whether pull or push evidence confirms the supplied synchronization. */
export function hasFreshEvidence(
  store: ReadonlyMap<string, DiagnosticCacheEntry>,
  synchronization: DiagnosticSynchronization,
  currentEvidenceRevision?: number,
): boolean {
  return (
    hasCurrentEvidence(store, synchronization, currentEvidenceRevision) &&
    !isTentativePushEntry(store.get(synchronization.uri))
  );
}

/** Return the latest ambient update for one of the synchronizations. */
export function latestCurrentEvidenceReceivedAt(
  store: ReadonlyMap<string, DiagnosticCacheEntry>,
  synchronizations: readonly DiagnosticSynchronization[],
  currentEvidenceRevision?: number,
): number {
  let latest = 0;
  for (const synchronization of synchronizations) {
    const entry = store.get(synchronization.uri);
    if (hasCurrentEvidence(store, synchronization, currentEvidenceRevision)) {
      latest = Math.max(latest, entry?.receivedAt ?? 0);
    }
  }
  return latest;
}

/** Return explicit partial or unavailable evidence after fresh collection fails. */
export function incompleteDiagnosticResult(
  cachedDiagnostics: Diagnostic[] | null,
  outcome: "released" | "timed-out",
): CodeQueryResult<Diagnostic[]> {
  if (outcome === "released") {
    return unavailableCodeQuery(
      "Diagnostic collection ended before the current document synchronization was confirmed.",
    );
  }
  if (cachedDiagnostics) {
    return partialCodeQuery(
      cachedDiagnostics,
      "Fresh diagnostics were not confirmed for the current document synchronization; cached diagnostics are partial evidence.",
    );
  }
  return unavailableCodeQuery(
    "Fresh diagnostics were not confirmed for the current document synchronization.",
  );
}

interface ApplyPullReportOptions {
  readonly store: Map<string, DiagnosticCacheEntry>;
  readonly uri: string;
  readonly report: DocumentDiagnosticReport;
  readonly previous: DiagnosticCacheEntry | undefined;
  readonly previousResultId: string | undefined;
  readonly synchronizationId: number | undefined;
  readonly evidenceRevision: number;
  readonly isRelatedUriTracked: (uri: string) => boolean;
  readonly source?: Exclude<DiagnosticEvidenceSource, "push">;
}

/** Apply one valid full or linked unchanged pull report. */
export function applyPullReport(options: ApplyPullReportOptions): boolean {
  if (!isValidDocumentDiagnosticReport(options.report)) return false;
  const {
    store,
    uri,
    report,
    previous,
    previousResultId,
    synchronizationId,
    evidenceRevision,
    isRelatedUriTracked,
  } = options;
  // A report validated as full (kind "full", "", or absent — gopls v0.23.0)
  // stores its items; only an explicit "unchanged" reuses the previous entry.
  if (report.kind !== "unchanged") {
    if (!Array.isArray(report.items)) return false;
    if (report.resultId !== undefined && typeof report.resultId !== "string") return false;
    store.set(uri, {
      diagnostics: report.items,
      receivedAt: Date.now(),
      source: options.source ?? "pull",
      synchronizationId,
      evidenceRevision,
      resultId: report.resultId,
    });
    applyRelatedPullReports({
      store,
      report,
      evidenceRevision,
      isRelatedUriTracked,
      source: options.source ?? "pull",
    });
    return true;
  }
  if (!previous || previousResultId === undefined || typeof report.resultId !== "string") {
    return false;
  }
  store.set(uri, {
    ...previous,
    receivedAt: Date.now(),
    source: options.source ?? "pull",
    synchronizationId,
    evidenceRevision,
    resultId: report.resultId,
  });
  applyRelatedPullReports({
    store,
    report,
    evidenceRevision,
    isRelatedUriTracked,
    source: options.source ?? "pull",
  });
  return true;
}

function applyRelatedPullReports(options: {
  store: Map<string, DiagnosticCacheEntry>;
  report: DocumentDiagnosticReport;
  evidenceRevision: number;
  isRelatedUriTracked: (uri: string) => boolean;
  source: Exclude<DiagnosticEvidenceSource, "push">;
}): void {
  for (const [relatedUri, relatedReport] of Object.entries(options.report.relatedDocuments ?? {})) {
    if (!isValidDocumentDiagnosticReport(relatedReport, false)) continue;
    // Skip explicit unchanged reports; full reports (kind "full", "", or
    // absent) may enter the related-document store.
    if (relatedReport.kind === "unchanged") continue;
    if (options.isRelatedUriTracked(relatedUri)) continue;
    const existing = options.store.get(relatedUri);
    if (existing?.evidenceRevision === options.evidenceRevision) continue;
    options.store.set(relatedUri, {
      diagnostics: relatedReport.items,
      receivedAt: Date.now(),
      source: options.source,
      evidenceRevision: options.evidenceRevision,
      resultId: relatedReport.resultId,
    });
  }
}
