import {
  type CodeQueryResult,
  partialCodeQuery,
  unavailableCodeQuery,
} from "@mrclrchtr/supi-code-runtime/api";
import type { Diagnostic, DocumentDiagnosticReport } from "../config/types.ts";
import type { DiagnosticStateWait } from "./client-diagnostic-waiters.ts";

/** Stored diagnostic data and the protocol evidence that established it. */
export interface DiagnosticCacheEntry {
  diagnostics: Diagnostic[];
  receivedAt: number;
  source: "pull" | "push";
  synchronizationId?: number;
  version?: number;
  resultId?: string;
}

/** One document synchronization that needs current diagnostic evidence. */
export interface DiagnosticSynchronization {
  readonly uri: string;
  readonly synchronizationId: number;
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
  openDocs: ReadonlyMap<string, { synchronizationId: number }>,
  synchronization: DiagnosticSynchronization,
): boolean {
  return openDocs.get(synchronization.uri)?.synchronizationId === synchronization.synchronizationId;
}

/** Test whether a fresh push confirms the supplied synchronization. */
export function hasFreshPush(
  store: ReadonlyMap<string, DiagnosticCacheEntry>,
  synchronization: DiagnosticSynchronization,
): boolean {
  const entry = store.get(synchronization.uri);
  return entry?.source === "push" && entry.synchronizationId === synchronization.synchronizationId;
}

/** Test whether pull or push evidence confirms the supplied synchronization. */
export function hasFreshEvidence(
  store: ReadonlyMap<string, DiagnosticCacheEntry>,
  synchronization: DiagnosticSynchronization,
): boolean {
  return store.get(synchronization.uri)?.synchronizationId === synchronization.synchronizationId;
}

/** Return the latest cache update that confirms one of the synchronizations. */
export function latestFreshEvidenceReceivedAt(
  store: ReadonlyMap<string, DiagnosticCacheEntry>,
  synchronizations: DiagnosticSynchronization[],
): number {
  let latest = 0;
  for (const synchronization of synchronizations) {
    const entry = store.get(synchronization.uri);
    if (entry?.synchronizationId === synchronization.synchronizationId) {
      latest = Math.max(latest, entry.receivedAt);
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
}

/** Apply one valid full or linked unchanged pull report. */
export function applyPullReport(options: ApplyPullReportOptions): boolean {
  const { store, uri, report, previous, previousResultId, synchronizationId } = options;
  if (report.kind === "full") {
    if (!Array.isArray(report.items)) return false;
    if (report.resultId !== undefined && typeof report.resultId !== "string") return false;
    store.set(uri, {
      diagnostics: report.items,
      receivedAt: Date.now(),
      source: "pull",
      synchronizationId,
      resultId: report.resultId,
    });
    applyRelatedPullReports(store, report);
    return true;
  }
  if (report.kind !== "unchanged") return false;
  if (!previous || previousResultId === undefined || typeof report.resultId !== "string") {
    return false;
  }
  store.set(uri, {
    ...previous,
    receivedAt: Date.now(),
    source: "pull",
    synchronizationId,
    resultId: report.resultId,
  });
  applyRelatedPullReports(store, report);
  return true;
}

function applyRelatedPullReports(
  store: Map<string, DiagnosticCacheEntry>,
  report: DocumentDiagnosticReport,
): void {
  for (const [relatedUri, relatedReport] of Object.entries(report.relatedDocuments ?? {})) {
    if (!relatedReport || typeof relatedReport !== "object") continue;
    if (relatedReport.kind !== "full" || !Array.isArray(relatedReport.items)) continue;
    if (relatedReport.resultId !== undefined && typeof relatedReport.resultId !== "string")
      continue;
    store.set(relatedUri, {
      diagnostics: relatedReport.items,
      receivedAt: Date.now(),
      source: "pull",
      resultId: relatedReport.resultId,
    });
  }
}
