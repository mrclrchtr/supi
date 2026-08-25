import type { PublishDiagnosticsParams } from "../config/types.ts";
import { uriToFile } from "../utils.ts";
import {
  type DiagnosticCacheEntry,
  isTentativePushEntry,
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
 * Apply one valid push publication.
 *
 * Returns whether the publication was accepted and whether it promoted a
 * tentative entry to confirmed. Fail-closed policy (ADR 0020): unversioned
 * pushes are rejected for closed and untracked URIs and for arrivals before
 * the URI's sync moment; versioned pushes for a URI closed by a lifecycle
 * operation are rejected because their version cannot be verified. An
 * unversioned push that arrives after the sync moment of an open document
 * is accepted and re-stamped with that document's current synchronization
 * state. The first valid publication for a synchronization is tentative; a
 * later valid publication for the same synchronization ID and evidence
 * revision promotes the cache to confirmed (ADR 0021).
 */
export function applyPushDiagnostics(options: ApplyPushOptions): {
  accepted: boolean;
  promoted: boolean;
} {
  if (!isValidPublishDiagnosticsParams(options.params)) return { accepted: false, promoted: false };
  const openDocument = options.openDocuments.get(options.params.uri);
  if (options.params.version !== undefined) {
    if (!Number.isInteger(options.params.version)) return { accepted: false, promoted: false };
    if (openDocument && options.params.version !== openDocument.version) {
      return { accepted: false, promoted: false };
    }
    if (!openDocument && options.closedVersionedBarrier)
      return { accepted: false, promoted: false };
  }
  if (!Array.isArray(options.params.diagnostics)) return { accepted: false, promoted: false };
  if (!acceptUnversionedPush(options, openDocument)) return { accepted: false, promoted: false };
  const entry = buildPushCacheEntry(options, openDocument);
  const previous = options.store.get(options.params.uri);
  const promoted =
    entry.source === "push" &&
    entry.publications !== undefined &&
    entry.publications >= 2 &&
    isTentativePushEntry(previous);
  options.store.set(options.params.uri, entry);
  return { accepted: true, promoted };
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
  const synchronizationId =
    unversioned || currentRevision ? openDocument?.synchronizationId : undefined;
  const evidenceRevision = openDocument?.evidenceRevision;
  const previous = options.store.get(options.params.uri);
  // A later valid publication for the same synchronization ID and evidence
  // revision continues the entry's publication count: a confirmed pull
  // entry keeps the synchronization confirmed, and a tentative push entry
  // is promoted. Any other publication starts a fresh count.
  const sameSynchronization =
    synchronizationId !== undefined &&
    previous?.synchronizationId === synchronizationId &&
    previous.evidenceRevision === evidenceRevision;
  const publications = sameSynchronization ? Math.min((previous.publications ?? 1) + 1, 2) : 1;
  return {
    diagnostics: options.params.diagnostics,
    receivedAt: Date.now(),
    source: "push",
    synchronizationId,
    evidenceRevision,
    version: options.params.version,
    publications,
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
    const entry = options.store.get(uri);
    const fileState = getDiagnosticFileState(uriToFile(uri));
    const current = hasCurrentDiagnosticEvidence(document, entry, options.evidenceRevision);
    const failed = options.failedDocuments.has(uri);
    // A current tentative push maps to unconfirmed, not to a new public
    // status: it matches the synchronization but cannot confirm it yet, so
    // it must not claim current snapshot or document state (issue #351).
    const tentative = current && isTentativePushEntry(entry);
    documents.push({
      uri,
      current: fileState === "present" && current && !failed && !tentative,
      status: statusForDocument(fileState, current, failed, tentative),
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
  tentative: boolean,
): "confirmed" | "unconfirmed" | "failed" | "removed" {
  if (fileState === "removed") return "removed";
  if (fileState === "unreadable" || failed) return "failed";
  if (tentative || !current) return "unconfirmed";
  return "confirmed";
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
    // A current tentative error is useful partial evidence. Keep its entry
    // non-current so it cannot establish a clean or settled result (ADR 0021).
    const tentative = entryCurrent && isTentativePushEntry(entry);
    const confirmed = entryCurrent && !tentative;
    current &&= confirmed;
    if (entry.diagnostics.length > 0) {
      entries.push({ uri, diagnostics: entry.diagnostics, current: confirmed });
    }
  }
  return { entries, current };
}
