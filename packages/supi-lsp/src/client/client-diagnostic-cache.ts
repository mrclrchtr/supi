import { uriToFile } from "@mrclrchtr/supi-core/path";
import type { PublishDiagnosticsParams } from "../config/types.ts";
import {
  type DiagnosticCacheEntry,
  isTentativePushEntry,
  isValidPublishDiagnosticsParams,
} from "./client-diagnostic-evidence.ts";
import { type DiskStamp, sameDiskStamp } from "./client-disk-stamp.ts";
import type { ClientDiagnosticSnapshot, OpenDocumentState } from "./client-document-state.ts";
import { hasCurrentDiagnosticEvidence } from "./client-document-state.ts";
import {
  type DiagnosticFileState,
  type DiagnosticFileStatus,
  getDiagnosticFileStatus,
} from "./client-file-state.ts";

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
 * Ambient pushes are observations, not confirmation evidence. Fail-closed
 * policy (ADR 0020): unversioned pushes are rejected for closed and
 * untracked URIs and for arrivals before the URI's sync moment; versioned
 * pushes for a URI closed by a lifecycle operation are rejected because their
 * version cannot be verified. An unversioned push that arrives after the sync
 * moment of an open document is accepted and re-stamped with that document's
 * current synchronization state. Publication counts remain telemetry only.
 */
export function applyPushDiagnostics(options: ApplyPushOptions): { accepted: boolean } {
  if (!isValidPublishDiagnosticsParams(options.params)) return { accepted: false };
  const openDocument = options.openDocuments.get(options.params.uri);
  if (options.params.version !== undefined) {
    if (!Number.isInteger(options.params.version)) return { accepted: false };
    if (openDocument && options.params.version !== openDocument.version) {
      return { accepted: false };
    }
    if (!openDocument && options.closedVersionedBarrier) return { accepted: false };
  }
  if (!Array.isArray(options.params.diagnostics)) return { accepted: false };
  if (!acceptUnversionedPush(options, openDocument)) return { accepted: false };
  const previous = options.store.get(options.params.uri);
  // A request-confirmed result owns the synchronization. Ambient pushes may
  // still release waiters and telemetry, but they must not replace that result.
  if (isCurrentRequestEvidence(previous, openDocument, options.evidenceRevision)) {
    return { accepted: true };
  }
  const entry = buildPushCacheEntry(options, openDocument);
  options.store.set(options.params.uri, entry);
  return { accepted: true };
}

/** Test whether a request result still owns the current document generation. */
function isCurrentRequestEvidence(
  entry: DiagnosticCacheEntry | undefined,
  document: OpenDocumentState | undefined,
  evidenceRevision: number,
): boolean {
  return Boolean(
    entry &&
      entry.source !== "push" &&
      document &&
      entry.synchronizationId === document.synchronizationId &&
      entry.evidenceRevision === evidenceRevision &&
      document.evidenceRevision === evidenceRevision,
  );
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
 * document's current synchronization state. Versioned pushes keep the
 * current-revision check: a version match alone does not prove a current
 * generation.
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
  // revision continues the entry's publication count for telemetry. Any
  // other publication starts a fresh count.
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

/** Options for one client diagnostic snapshot. */
export interface BuildClientDiagnosticSnapshotOptions {
  store: ReadonlyMap<string, DiagnosticCacheEntry>;
  openDocuments: ReadonlyMap<string, OpenDocumentState>;
  failedDocuments: ReadonlySet<string>;
  evidenceRevision: number;
  /** Stamp of the last verified disk read for one URI, when one exists. */
  observedDiskStamp?: (uri: string) => DiskStamp | undefined;
  /** File-status seam; defaults to one stat per URI. */
  readFileStatus?: (filePath: string) => DiagnosticFileStatus;
}

/** Per-URI disk facts shared by every projection of one snapshot. */
interface SnapshotFileFacts {
  readonly state: DiagnosticFileState;
  /** The file's disk stamp differs from the last verified read. */
  readonly diskChanged: boolean;
}

/**
 * Build one client snapshot without dropping empty-cache freshness.
 *
 * Passive and side-effect free: one stat per URI, no synchronization, request,
 * or enrollment. A document whose disk stamp differs from its last verified
 * read is reported unconfirmed with reason `disk-changed`. Metadata can only
 * withdraw confirmation; a later content read restores it.
 */
export function buildClientDiagnosticSnapshot(
  options: BuildClientDiagnosticSnapshotOptions,
): ClientDiagnosticSnapshot {
  const facts = createFileFactsReader(options);
  const documents = collectDocumentFreshness(options, facts);
  const cache = collectCachedDiagnostics(options, facts);
  return {
    entries: cache.entries,
    documents,
    current: cache.current && documents.every((document) => document.current),
  };
}

function createFileFactsReader(
  options: BuildClientDiagnosticSnapshotOptions,
): (uri: string) => SnapshotFileFacts {
  const readFileStatus = options.readFileStatus ?? getDiagnosticFileStatus;
  const cache = new Map<string, SnapshotFileFacts>();
  return (uri) => {
    const cached = cache.get(uri);
    if (cached) return cached;
    const status = readFileStatus(uriToFile(uri));
    const observed = options.observedDiskStamp?.(uri);
    const facts = {
      state: status.state,
      diskChanged:
        status.state === "present" &&
        observed !== undefined &&
        (status.stamp === undefined || !sameDiskStamp(observed, status.stamp)),
    };
    cache.set(uri, facts);
    return facts;
  };
}

function collectDocumentFreshness(
  options: BuildClientDiagnosticSnapshotOptions,
  facts: (uri: string) => SnapshotFileFacts,
): ClientDiagnosticSnapshot["documents"] {
  const open = collectOpenDocumentFreshness(options, facts);
  return [
    ...open.documents,
    ...collectFailedDocumentFreshness(options.failedDocuments, open.uris, facts),
    ...collectUntrackedCacheFreshness(options.store, open.uris, options.failedDocuments, facts),
  ];
}

function collectOpenDocumentFreshness(
  options: BuildClientDiagnosticSnapshotOptions,
  facts: (uri: string) => SnapshotFileFacts,
): { documents: ClientDiagnosticSnapshot["documents"]; uris: ReadonlySet<string> } {
  const documents: ClientDiagnosticSnapshot["documents"] = [];
  const uris = new Set<string>();
  for (const [uri, document] of options.openDocuments) {
    uris.add(uri);
    const entry = options.store.get(uri);
    const { state: fileState, diskChanged } = facts(uri);
    const current = hasCurrentDiagnosticEvidence(document, entry, options.evidenceRevision);
    const failed = options.failedDocuments.has(uri);
    // A current tentative push maps to unconfirmed, not to a new public
    // status: it matches the synchronization but cannot confirm it yet, so
    // it must not claim current snapshot or document state (issue #351).
    const tentative = current && isTentativePushEntry(entry);
    const status = statusForDocument(fileState, current && !diskChanged, failed, tentative);
    documents.push({
      uri,
      current: fileState === "present" && current && !failed && !tentative && !diskChanged,
      status,
      // Name the cause only where it alone withdrew confirmation.
      ...(diskChanged && status === "unconfirmed" && current && !tentative
        ? { reason: "disk-changed" as const }
        : {}),
    });
  }
  return { documents, uris };
}

function collectFailedDocumentFreshness(
  failedDocuments: ReadonlySet<string>,
  openUris: ReadonlySet<string>,
  facts: (uri: string) => SnapshotFileFacts,
): ClientDiagnosticSnapshot["documents"] {
  return Array.from(failedDocuments)
    .filter((uri) => !openUris.has(uri))
    .map((uri) => ({
      uri,
      current: false,
      status: facts(uri).state === "removed" ? ("removed" as const) : ("failed" as const),
    }));
}

function collectUntrackedCacheFreshness(
  store: ReadonlyMap<string, DiagnosticCacheEntry>,
  openUris: ReadonlySet<string>,
  failedDocuments: ReadonlySet<string>,
  facts: (uri: string) => SnapshotFileFacts,
): ClientDiagnosticSnapshot["documents"] {
  return Array.from(store.keys())
    .filter((uri) => !openUris.has(uri) && !failedDocuments.has(uri))
    .map((uri) => {
      const state = facts(uri).state;
      return {
        uri,
        current: false,
        status:
          state === "removed"
            ? ("removed" as const)
            : state === "unreadable"
              ? ("failed" as const)
              : ("unconfirmed" as const),
      };
    });
}

function statusForDocument(
  fileState: DiagnosticFileState,
  current: boolean,
  failed: boolean,
  tentative: boolean,
): "confirmed" | "unconfirmed" | "failed" | "removed" {
  if (fileState === "removed") return "removed";
  if (fileState === "unreadable" || failed) return "failed";
  if (tentative || !current) return "unconfirmed";
  return "confirmed";
}

function collectCachedDiagnostics(
  options: BuildClientDiagnosticSnapshotOptions,
  facts: (uri: string) => SnapshotFileFacts,
): {
  entries: ClientDiagnosticSnapshot["entries"];
  current: boolean;
} {
  const entries: ClientDiagnosticSnapshot["entries"] = [];
  let current = true;
  for (const [uri, entry] of options.store) {
    const fileFacts = facts(uri);
    if (fileFacts.state === "removed") continue;
    const entryCurrent = hasCurrentDiagnosticEvidence(
      options.openDocuments.get(uri),
      entry,
      options.evidenceRevision,
    );
    // A current tentative error is useful partial evidence. Keep its entry
    // non-current so it cannot establish a clean or settled result. The same
    // applies to diagnostics of content that changed on disk since.
    const tentative = entryCurrent && isTentativePushEntry(entry);
    const confirmed = entryCurrent && !tentative && !fileFacts.diskChanged;
    current &&= confirmed;
    if (entry.diagnostics.length > 0) {
      entries.push({ uri, diagnostics: entry.diagnostics, current: confirmed });
    }
  }
  return { entries, current };
}
