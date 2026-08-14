import type { PublishDiagnosticsParams } from "../config/types.ts";
import { uriToFile } from "../utils.ts";
import {
  type DiagnosticCacheEntry,
  isValidPublishDiagnosticsParams,
} from "./client-diagnostic-evidence.ts";
import type { ClientDiagnosticSnapshot, OpenDocumentState } from "./client-document-state.ts";
import { hasCurrentDiagnosticEvidence } from "./client-document-state.ts";
import { getDiagnosticFileState } from "./client-file-state.ts";

interface ApplyPushOptions {
  store: Map<string, DiagnosticCacheEntry>;
  openDocuments: ReadonlyMap<string, OpenDocumentState>;
  params: PublishDiagnosticsParams;
  evidenceRevision: number;
  /** Client-side sync moment for the URI, or undefined when never synchronized. */
  unversionedSyncMoment: number | undefined;
  /** Whether a lifecycle close marked this URI fail-closed for versioned pushes. */
  closedVersionedBarrier: boolean;
}

/**
 * Apply one valid push publication and return whether it can release current waiters.
 *
 * Fail-closed policy (ADR 0020): unversioned pushes are rejected for closed
 * and untracked URIs and for arrivals before the URI's sync moment; versioned
 * pushes for a URI closed by a lifecycle operation are rejected because their
 * version cannot be verified. An unversioned push that arrives after the sync
 * moment of an open document is accepted and re-stamped with that document's
 * current synchronization state.
 */
export function applyPushDiagnostics(options: ApplyPushOptions): boolean {
  if (!isValidPublishDiagnosticsParams(options.params)) return false;
  const openDocument = options.openDocuments.get(options.params.uri);
  if (options.params.version !== undefined) {
    if (!Number.isInteger(options.params.version)) return false;
    if (openDocument && options.params.version !== openDocument.version) return false;
    if (!openDocument && options.closedVersionedBarrier) return false;
  }
  if (!Array.isArray(options.params.diagnostics)) return false;
  if (!acceptUnversionedPush(options, openDocument)) return false;
  options.store.set(options.params.uri, buildPushCacheEntry(options, openDocument));
  return true;
}

/** Gate one unversioned push publication against the sync-moment policy. */
function acceptUnversionedPush(
  options: ApplyPushOptions,
  openDocument: OpenDocumentState | undefined,
): boolean {
  if (options.params.version !== undefined) return true;
  if (!openDocument) return false;
  return !(
    options.unversionedSyncMoment !== undefined && Date.now() < options.unversionedSyncMoment
  );
}

/**
 * Build the stored entry for one accepted push publication.
 *
 * Time-gated unversioned acceptance re-stamps the entry with the open
 * document's current synchronization state, so the push proves that
 * document's synchronization. Versioned pushes keep the current-revision
 * check: a version match alone does not prove a current generation.
 */
function buildPushCacheEntry(
  options: ApplyPushOptions,
  openDocument: OpenDocumentState | undefined,
): DiagnosticCacheEntry {
  const currentRevision = openDocument?.evidenceRevision === options.evidenceRevision;
  const unversioned = options.params.version === undefined && openDocument !== undefined;
  return {
    diagnostics: options.params.diagnostics,
    receivedAt: Date.now(),
    source: "push",
    synchronizationId: unversioned || currentRevision ? openDocument?.synchronizationId : undefined,
    evidenceRevision: openDocument?.evidenceRevision,
    version: options.params.version,
  };
}

/** Build one client snapshot without dropping empty-cache freshness. */
export function buildClientDiagnosticSnapshot(options: {
  store: ReadonlyMap<string, DiagnosticCacheEntry>;
  openDocuments: ReadonlyMap<string, OpenDocumentState>;
  failedDocuments: ReadonlySet<string>;
  evidenceRevision: number;
}): ClientDiagnosticSnapshot {
  const documents = collectDocumentFreshness(options);
  const cache = collectCachedDiagnostics(options);
  return {
    entries: cache.entries,
    documents,
    current: cache.current && documents.every((document) => document.current),
  };
}

function collectDocumentFreshness(options: {
  openDocuments: ReadonlyMap<string, OpenDocumentState>;
  failedDocuments: ReadonlySet<string>;
  store: ReadonlyMap<string, DiagnosticCacheEntry>;
  evidenceRevision: number;
}): ClientDiagnosticSnapshot["documents"] {
  const open = collectOpenDocumentFreshness(options);
  return [
    ...open.documents,
    ...collectFailedDocumentFreshness(options.failedDocuments, open.uris),
    ...collectUntrackedCacheFreshness(options.store, open.uris, options.failedDocuments),
  ];
}

function collectOpenDocumentFreshness(options: {
  openDocuments: ReadonlyMap<string, OpenDocumentState>;
  failedDocuments: ReadonlySet<string>;
  store: ReadonlyMap<string, DiagnosticCacheEntry>;
  evidenceRevision: number;
}): { documents: ClientDiagnosticSnapshot["documents"]; uris: ReadonlySet<string> } {
  const documents: ClientDiagnosticSnapshot["documents"] = [];
  const uris = new Set<string>();
  for (const [uri, document] of options.openDocuments) {
    uris.add(uri);
    const fileState = getDiagnosticFileState(uriToFile(uri));
    const current = hasCurrentDiagnosticEvidence(
      document,
      options.store.get(uri),
      options.evidenceRevision,
    );
    const failed = options.failedDocuments.has(uri);
    documents.push({
      uri,
      current: fileState === "present" && current && !failed,
      status: statusForDocument(fileState, current, failed),
    });
  }
  return { documents, uris };
}

function collectFailedDocumentFreshness(
  failedDocuments: ReadonlySet<string>,
  openUris: ReadonlySet<string>,
): ClientDiagnosticSnapshot["documents"] {
  return Array.from(failedDocuments)
    .filter((uri) => !openUris.has(uri))
    .map((uri) => ({
      uri,
      current: false,
      status:
        getDiagnosticFileState(uriToFile(uri)) === "removed"
          ? ("removed" as const)
          : ("failed" as const),
    }));
}

function collectUntrackedCacheFreshness(
  store: ReadonlyMap<string, DiagnosticCacheEntry>,
  openUris: ReadonlySet<string>,
  failedDocuments: ReadonlySet<string>,
): ClientDiagnosticSnapshot["documents"] {
  return Array.from(store.keys())
    .filter((uri) => !openUris.has(uri) && !failedDocuments.has(uri))
    .map((uri) => ({
      uri,
      current: false,
      status:
        getDiagnosticFileState(uriToFile(uri)) === "removed"
          ? ("removed" as const)
          : getDiagnosticFileState(uriToFile(uri)) === "unreadable"
            ? ("failed" as const)
            : ("unconfirmed" as const),
    }));
}

function statusForDocument(
  fileState: ReturnType<typeof getDiagnosticFileState>,
  current: boolean,
  failed: boolean,
): "confirmed" | "unconfirmed" | "failed" | "removed" {
  if (fileState === "removed") return "removed";
  if (fileState === "unreadable" || failed) return "failed";
  return current ? "confirmed" : "unconfirmed";
}

function collectCachedDiagnostics(options: {
  store: ReadonlyMap<string, DiagnosticCacheEntry>;
  openDocuments: ReadonlyMap<string, OpenDocumentState>;
  evidenceRevision: number;
}): {
  entries: ClientDiagnosticSnapshot["entries"];
  current: boolean;
} {
  const entries: ClientDiagnosticSnapshot["entries"] = [];
  let current = true;
  for (const [uri, entry] of options.store) {
    if (getDiagnosticFileState(uriToFile(uri)) === "removed") continue;
    const entryCurrent = hasCurrentDiagnosticEvidence(
      options.openDocuments.get(uri),
      entry,
      options.evidenceRevision,
    );
    current &&= entryCurrent;
    if (entry.diagnostics.length > 0) {
      entries.push({ uri, diagnostics: entry.diagnostics, current: entryCurrent });
    }
  }
  return { entries, current };
}
