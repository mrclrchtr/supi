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
import type { DiagnosticStateWait } from "./client-diagnostic-waiters.ts";

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

/** Stored diagnostic data and the protocol evidence that established it. */
export interface DiagnosticCacheEntry {
  diagnostics: Diagnostic[];
  receivedAt: number;
  source: "pull" | "push";
  synchronizationId?: number;
  evidenceRevision?: number;
  version?: number;
  resultId?: string;
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

/** Test whether a fresh push confirms the supplied synchronization. */
export function hasFreshPush(
  store: ReadonlyMap<string, DiagnosticCacheEntry>,
  synchronization: DiagnosticSynchronization,
  currentEvidenceRevision?: number,
): boolean {
  const entry = store.get(synchronization.uri);
  return Boolean(
    entry?.source === "push" &&
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
  const entry = store.get(synchronization.uri);
  return Boolean(
    entry &&
      entry.synchronizationId === synchronization.synchronizationId &&
      (synchronization.evidenceRevision === undefined ||
        entry.evidenceRevision === synchronization.evidenceRevision) &&
      (currentEvidenceRevision === undefined || entry.evidenceRevision === currentEvidenceRevision),
  );
}

/** Return the latest cache update that confirms one of the synchronizations. */
export function latestFreshEvidenceReceivedAt(
  store: ReadonlyMap<string, DiagnosticCacheEntry>,
  synchronizations: DiagnosticSynchronization[],
  currentEvidenceRevision?: number,
): number {
  let latest = 0;
  for (const synchronization of synchronizations) {
    const entry = store.get(synchronization.uri);
    if (hasFreshEvidence(store, synchronization, currentEvidenceRevision)) {
      latest = Math.max(latest, entry?.receivedAt ?? 0);
    }
  }
  return latest;
}

interface PullRaceOptions {
  readonly pull: Promise<boolean>;
  readonly waitForChange: () => DiagnosticStateWait;
  readonly freshPush: () => boolean;
  readonly current: () => boolean;
}

/** Race a pull against fresh push evidence and lifecycle release. */
export async function raceDiagnosticPull(
  options: PullRaceOptions,
): Promise<"pull" | "push" | "released"> {
  const pull = options.pull.then((confirmed) =>
    confirmed ? ("pull" as const) : ("released" as const),
  );
  while (options.current()) {
    if (options.freshPush()) return "push";
    const change = options.waitForChange();
    let outcome: "changed" | "pull" | "released";
    try {
      outcome = await Promise.race([pull, change.promise.then(() => "changed" as const)]);
    } finally {
      change.cancel();
    }
    if (outcome !== "changed") return outcome;
  }
  return "released";
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
      source: "pull",
      synchronizationId,
      evidenceRevision,
      resultId: report.resultId,
    });
    applyRelatedPullReports(store, report, evidenceRevision, isRelatedUriTracked);
    return true;
  }
  if (!previous || previousResultId === undefined || typeof report.resultId !== "string") {
    return false;
  }
  store.set(uri, {
    ...previous,
    receivedAt: Date.now(),
    source: "pull",
    synchronizationId,
    evidenceRevision,
    resultId: report.resultId,
  });
  applyRelatedPullReports(store, report, evidenceRevision, isRelatedUriTracked);
  return true;
}

function applyRelatedPullReports(
  store: Map<string, DiagnosticCacheEntry>,
  report: DocumentDiagnosticReport,
  evidenceRevision: number,
  isRelatedUriTracked: (uri: string) => boolean,
): void {
  for (const [relatedUri, relatedReport] of Object.entries(report.relatedDocuments ?? {})) {
    if (!isValidDocumentDiagnosticReport(relatedReport, false)) continue;
    // Skip explicit unchanged reports; full reports (kind "full", "", or
    // absent) may enter the related-document store.
    if (relatedReport.kind === "unchanged") continue;
    if (isRelatedUriTracked(relatedUri)) continue;
    const existing = store.get(relatedUri);
    if (existing?.evidenceRevision === evidenceRevision) continue;
    store.set(relatedUri, {
      diagnostics: relatedReport.items,
      receivedAt: Date.now(),
      source: "pull",
      evidenceRevision,
      resultId: relatedReport.resultId,
    });
  }
}
