// biome-ignore-all lint/style/noExcessiveLinesPerFile: one client's document sync, diagnostics, refresh, and sync-file flow stay in one cohesive class.
import * as path from "node:path";
import {
  type CodeQueryResult,
  type CodeRequestControl,
  completedCodeQuery,
  throwIfCodeRequestInterrupted,
  unavailableCodeQuery,
} from "@mrclrchtr/supi-code-runtime/api";
import type { Diagnostic, TextDocumentItem } from "../config/types.ts";
import type { DiagnosticEvidenceSummary } from "../diagnostics/evidence.ts";
import { detectLanguageId, fileToUri, uriToFile } from "../utils.ts";
import { applyPushDiagnostics, buildClientDiagnosticSnapshot } from "./client-diagnostic-cache.ts";
import { collectSynchronizedFileDiagnostics } from "./client-diagnostic-collection.ts";
import {
  type DiagnosticCacheEntry,
  type DiagnosticSynchronization,
  hasFreshPush,
  isCurrentSynchronization,
  isValidPublishDiagnosticsParams,
  nextDocumentVersion,
} from "./client-diagnostic-evidence.ts";
import type { ClientDiagnosticsHost } from "./client-diagnostic-host.ts";
import {
  pullClientDiagnosticEvidenceFromHost,
  refreshClientOpenDiagnostics,
  sendDidCloseNotification,
} from "./client-diagnostic-refresh.ts";
import { DiagnosticObserver, type DiagnosticPushWaitOutcome } from "./client-diagnostic-timing.ts";
import { DiagnosticWaitRegistry } from "./client-diagnostic-waiters.ts";
import {
  type ClientDiagnosticSnapshot,
  type DiagnosticEntry,
  fingerprintDocumentContent,
  hasCurrentDiagnosticEvidence,
  type OpenDocumentState,
} from "./client-document-state.ts";
import {
  clearTrackedDocumentState,
  reopenDocument,
  synchronizeTrackedDocument,
} from "./client-document-sync.ts";
import { getDiagnosticFileState } from "./client-file-state.ts";

const DIAGNOSTIC_WAIT_MS = 3_000;
/** Bounded push wait after a reopen-resync fallback, in milliseconds. */
const REOPEN_EVIDENCE_WAIT_MS = 1_000;
/** Own one client's document and diagnostic evidence; revisions prevent stale reuse. */
export class ClientDiagnostics {
  readonly #openDocs = new Map<string, OpenDocumentState>();
  readonly #diagnosticStore = new Map<string, DiagnosticCacheEntry>();
  readonly #waiters = new DiagnosticWaitRegistry();
  readonly #versionHistory = new Map<string, number>();
  readonly #failedUris = new Set<string>();
  /** Client-side sync moment per URI: unversioned pushes before it stay rejected. */
  readonly #unversionedPushSyncMoments = new Map<string, number>();
  /** URIs closed by a lifecycle operation: versioned pushes stay fail-closed. */
  readonly #closedVersionedBarrier = new Set<string>();
  #evidenceRevision = 0;
  #nextSynchronizationId = 0;

  constructor(private readonly host: ClientDiagnosticsHost) {}

  get openFiles(): string[] {
    return Array.from(this.#openDocs.keys()).map(uriToFile);
  }

  clear(options: { preserveFailedDocuments?: boolean } = {}): void {
    if (options.preserveFailedDocuments) {
      for (const uri of [...this.#openDocs.keys(), ...this.#diagnosticStore.keys()]) {
        this.#failedUris.add(uri);
        this.#closedVersionedBarrier.add(uri);
      }
    } else {
      this.#failedUris.clear();
      this.#closedVersionedBarrier.clear();
    }
    this.#openDocs.clear();
    this.#diagnosticStore.clear();
    this.#versionHistory.clear();
    this.#evidenceRevision++;
    this.#unversionedPushSyncMoments.clear();
    this.#waiters.releaseAll();
    this.#waiters.cancelSettle();
  }

  didOpen(filePath: string, content: string): void {
    if (!this.host.isOperational()) return;

    const uri = fileToUri(filePath);
    this.#failedUris.delete(uri);
    if (this.#openDocs.has(uri)) {
      this.didChange(filePath, content);
      return;
    }

    const languageId = detectLanguageId(filePath);
    this.#waiters.cancelSettle();
    // A didOpen is a synchronization: pushes the server sends after it are
    // responses to the open and can become fresh evidence (ADR 0020).
    this.#unversionedPushSyncMoments.set(uri, Date.now());
    this.#closedVersionedBarrier.delete(uri);
    const version = nextDocumentVersion(this.#versionHistory, uri);
    this.#openDocs.set(uri, {
      version,
      synchronizationId: ++this.#nextSynchronizationId,
      evidenceRevision: this.#evidenceRevision,
      contentFingerprint: fingerprintDocumentContent(content),
    });
    this.host.sendNotification("textDocument/didOpen", {
      textDocument: {
        uri,
        languageId,
        version,
        text: content,
      } satisfies TextDocumentItem,
    });
  }

  didChange(filePath: string, content: string): void {
    if (!this.host.isOperational()) return;

    const uri = fileToUri(filePath);
    const doc = this.#openDocs.get(uri);
    if (!doc) {
      this.didOpen(filePath, content);
      return;
    }
    const nextFingerprint = fingerprintDocumentContent(content);
    if (doc.contentFingerprint === nextFingerprint) return;
    synchronizeTrackedDocument({
      uri,
      content,
      document: doc,
      nextVersion: () => nextDocumentVersion(this.#versionHistory, uri),
      nextSynchronizationId: () => ++this.#nextSynchronizationId,
      evidenceRevision: this.#evidenceRevision,
      waiters: this.#waiters,
      sendNotification: (method, params) => this.host.sendNotification(method, params),
      markUnversionedSyncMoment: () => this.#unversionedPushSyncMoments.set(uri, Date.now()),
      clearFailedFile: () => this.#failedUris.delete(uri),
      open: () => this.didOpen(filePath, content),
    });
  }

  didClose(filePath: string): void {
    const uri = fileToUri(filePath);
    const wasOpen = this.#openDocs.has(uri);
    this.#failedUris.delete(uri);
    this.#unversionedPushSyncMoments.delete(uri);
    this.#closedVersionedBarrier.add(uri);
    clearTrackedDocumentState(this.#openDocs, this.#diagnosticStore, this.#waiters, uri);

    if (wasOpen && this.host.isOperational()) {
      sendDidCloseNotification(this.host, uri);
    }
  }

  pruneMissingFiles(): string[] {
    const uris = new Set([...this.#openDocs.keys(), ...this.#diagnosticStore.keys()]);
    const removedFiles: string[] = [];

    for (const uri of uris) {
      const filePath = uriToFile(uri);
      if (getDiagnosticFileState(filePath) !== "removed") continue;

      const wasOpen = this.#openDocs.has(uri);
      this.#failedUris.add(uri);
      this.#unversionedPushSyncMoments.delete(uri);
      this.#closedVersionedBarrier.add(uri);
      clearTrackedDocumentState(this.#openDocs, this.#diagnosticStore, this.#waiters, uri);
      removedFiles.push(filePath);
      if (wasOpen && this.host.isOperational()) sendDidCloseNotification(this.host, uri);
    }

    return removedFiles;
  }
  /** Retain a failed document outcome when a replacement cannot reopen it. */
  markFailedFile(filePath: string): void {
    const uri = fileToUri(filePath);
    this.#failedUris.add(uri);
    this.#unversionedPushSyncMoments.delete(uri);
    this.#closedVersionedBarrier.add(uri);
  }

  getOpenDocumentVersion(filePath: string): number | null {
    return this.#openDocs.get(fileToUri(filePath))?.version ?? null;
  }
  getDiagnostics(filePath: string): Diagnostic[] {
    return this.#diagnosticStore.get(fileToUri(filePath))?.diagnostics ?? [];
  }
  getDiagnosticSnapshot(): ClientDiagnosticSnapshot {
    return buildClientDiagnosticSnapshot({
      store: this.#diagnosticStore,
      openDocuments: this.#openDocs,
      failedDocuments: this.#failedUris,
      evidenceRevision: this.#evidenceRevision,
    });
  }
  getAllDiagnostics(): DiagnosticEntry[] {
    return this.getDiagnosticSnapshot().entries;
  }
  clearPullResultIds(): void {
    for (const entry of this.#diagnosticStore.values()) delete entry.resultId;
  }
  /** Invalidate cache proof while retaining its data as partial fallback. */
  invalidateCachedEvidence(): void {
    this.#evidenceRevision++;
    const knownUris = new Set([
      ...this.#openDocs.keys(),
      ...this.#diagnosticStore.keys(),
      ...this.#versionHistory.keys(),
      ...this.#failedUris,
    ]);
    // A watched-file notification is sent immediately after this call, so the
    // recorded moment gates unversioned pushes around the invalidation: only
    // pushes the server sends after the change can become fresh evidence.
    const moment = Date.now();
    for (const uri of knownUris) {
      this.#unversionedPushSyncMoments.set(uri, moment);
      this.#closedVersionedBarrier.add(uri);
    }
  }

  handlePublishDiagnostics(params: unknown): void {
    if (!isValidPublishDiagnosticsParams(params)) return;
    if (
      !applyPushDiagnostics({
        store: this.#diagnosticStore,
        openDocuments: this.#openDocs,
        params,
        evidenceRevision: this.#evidenceRevision,
        unversionedSyncMoment: this.#unversionedPushSyncMoments.get(params.uri),
        closedVersionedBarrier: this.#closedVersionedBarrier.has(params.uri),
      })
    ) {
      return;
    }
    this.#waiters.releaseFile(params.uri, "published");
    this.#waiters.notifySettle();
  }
  async refreshOpenDiagnostics(
    options: { maxWaitMs?: number; quietMs?: number } & CodeRequestControl = {},
  ): Promise<DiagnosticEvidenceSummary> {
    const requestedFiles = Array.from(
      new Set([...this.#openDocs.keys(), ...this.#diagnosticStore.keys(), ...this.#failedUris]),
    ).map(uriToFile);
    return refreshClientOpenDiagnostics({
      host: this.host,
      openDocuments: this.#openDocs,
      diagnosticStore: this.#diagnosticStore,
      waiters: this.#waiters,
      versionHistory: this.#versionHistory,
      requestedFiles,
      evidenceRevision: () => this.#evidenceRevision,
      failedFiles: () => new Set(Array.from(this.#failedUris).map(uriToFile)),
      isRelatedUriTracked: (uri) => this.#openDocs.has(uri) || this.#versionHistory.has(uri),
      nextSynchronizationId: () => ++this.#nextSynchronizationId,
      invalidateEvidence: (uri) => {
        this.#failedUris.add(uri);
        const document = this.#openDocs.get(uri);
        if (document) document.evidenceRevision = -1;
      },
      clearFile: (uri) => {
        this.#failedUris.add(uri);
        this.#unversionedPushSyncMoments.delete(uri);
        this.#closedVersionedBarrier.add(uri);
        clearTrackedDocumentState(this.#openDocs, this.#diagnosticStore, this.#waiters, uri);
      },
      markUnversionedSyncMoment: (uri) => this.#unversionedPushSyncMoments.set(uri, Date.now()),
      clearFailedFile: (uri) => this.#failedUris.delete(uri),
      options,
    });
  }

  async syncAndWaitForDiagnostics(
    filePath: string,
    content: string,
    control?: CodeRequestControl,
  ): Promise<CodeQueryResult<Diagnostic[]>> {
    // Reject immediately when the request was already cancelled: no document
    // synchronization or protocol traffic may start for a caller that no
    // longer awaits a result.
    throwIfCodeRequestInterrupted(control);
    const supportsPull = this.host.supportsPullDiagnostics();
    const observer = new DiagnosticObserver("sync-file", supportsPull, control, {
      server: this.host.server,
      cwd: this.host.cwd,
      file: relativeDiagnosticFile(this.host.cwd, filePath),
    });
    const uri = fileToUri(filePath);
    const cached = this.#diagnosticStore.get(uri);
    const cachedDiagnostics = cached ? [...cached.diagnostics] : null;
    const syncStart = Date.now();
    const openDocument = this.#openDocs.get(uri);
    const contentUnchanged =
      openDocument?.contentFingerprint === fingerprintDocumentContent(content);
    const synchronizationCurrent = openDocument?.evidenceRevision === this.#evidenceRevision;
    const cacheCurrent = hasCurrentDiagnosticEvidence(openDocument, cached, this.#evidenceRevision);
    if (!contentUnchanged || !synchronizationCurrent || (cached !== undefined && !cacheCurrent)) {
      synchronizeTrackedDocument({
        uri,
        content,
        document: this.#openDocs.get(uri),
        nextVersion: () => nextDocumentVersion(this.#versionHistory, uri),
        nextSynchronizationId: () => ++this.#nextSynchronizationId,
        evidenceRevision: this.#evidenceRevision,
        waiters: this.#waiters,
        sendNotification: (method, params) => this.host.sendNotification(method, params),
        markUnversionedSyncMoment: () => this.#unversionedPushSyncMoments.set(uri, Date.now()),
        clearFailedFile: () => this.#failedUris.delete(uri),
        open: () => this.didOpen(filePath, content),
      });
    }
    const synchronization = this.#openDocs.get(uri);
    observer.synchronized();
    if (!synchronization) {
      return unavailableCodeQuery("The document could not be synchronized for diagnostics.");
    }
    if (
      contentUnchanged &&
      hasCurrentDiagnosticEvidence(synchronization, cached, this.#evidenceRevision)
    ) {
      observer.cacheReused(1);
      return completedCodeQuery(cachedDiagnostics ?? []);
    }
    const request = {
      uri,
      synchronizationId: synchronization.synchronizationId,
      evidenceRevision: synchronization.evidenceRevision,
    };
    return this.#collectFileDiagnosticsWithReopenRetry(
      {
        filePath,
        content,
        uri,
        supportsPull,
        syncStart,
        request,
        cachedDiagnostics,
        observer,
      },
      control,
    );
  }

  /**
   * Collect diagnostics for one synchronized document, retrying once through
   * a reopen-resync on push-only routes when the first wait times out.
   */
  async #collectFileDiagnosticsWithReopenRetry(
    options: {
      filePath: string;
      content: string;
      uri: string;
      supportsPull: boolean;
      syncStart: number;
      request: DiagnosticSynchronization;
      cachedDiagnostics: Diagnostic[] | null;
      observer: DiagnosticObserver;
    },
    control?: CodeRequestControl,
  ): Promise<CodeQueryResult<Diagnostic[]>> {
    const {
      filePath,
      content,
      uri,
      supportsPull,
      syncStart,
      request,
      cachedDiagnostics,
      observer,
    } = options;
    let pushOutcome: DiagnosticPushWaitOutcome | undefined;
    let attemptRequest = request;
    let attemptSyncStart = syncStart;
    let attemptMaxWaitMs = DIAGNOSTIC_WAIT_MS;
    let reopenedOnce = false;
    let result: CodeQueryResult<Diagnostic[]>;
    for (;;) {
      result = await collectSynchronizedFileDiagnostics(
        {
          supportsPull,
          syncStart: attemptSyncStart,
          maxWaitMs: attemptMaxWaitMs,
          request: attemptRequest,
          cachedDiagnostics,
          observer,
          waiters: this.#waiters,
          current: () => isCurrentSynchronization(this.#openDocs, attemptRequest),
          freshPush: () =>
            hasFreshPush(this.#diagnosticStore, attemptRequest, this.#evidenceRevision),
          diagnostics: () => this.getDiagnostics(filePath),
          pullDiagnostics: (timeoutMs, signal) =>
            pullClientDiagnosticEvidenceFromHost({
              host: this.host,
              store: this.#diagnosticStore,
              openDocuments: this.#openDocs,
              currentEvidenceRevision: () => this.#evidenceRevision,
              isRelatedUriTracked: (relatedUri) =>
                this.#openDocs.has(relatedUri) || this.#versionHistory.has(relatedUri),
              request: {
                uri,
                timeoutMs,
                synchronizationId: attemptRequest.synchronizationId,
                evidenceRevision: attemptRequest.evidenceRevision ?? this.#evidenceRevision,
                signal,
                deadline: control?.deadline,
                operationId: control?.operationId,
              },
            }),
          onPushWait: (outcome) => {
            pushOutcome = outcome;
          },
        },
        control,
      );
      // Reopen-resync fallback (R2): on push-only routes a document that
      // timed out with no push stays unconfirmed — a clean file gets no
      // push on didChange at all. Close and reopen it over the protocol so
      // the server publishes on didOpen, then wait once more with a bounded
      // budget. The cache entry and version history survive the reopen.
      const document = this.#openDocs.get(uri);
      if (
        supportsPull ||
        reopenedOnce ||
        result.kind === "completed" ||
        pushOutcome !== "timed-out" ||
        !document ||
        !isCurrentSynchronization(this.#openDocs, attemptRequest)
      ) {
        break;
      }
      reopenDocument({
        uri,
        content,
        document,
        languageId: detectLanguageId(filePath),
        nextVersion: () => nextDocumentVersion(this.#versionHistory, uri),
        nextSynchronizationId: () => ++this.#nextSynchronizationId,
        evidenceRevision: this.#evidenceRevision,
        waiters: this.#waiters,
        sendNotification: (method, params) => this.host.sendNotification(method, params),
        markUnversionedSyncMoment: () => this.#unversionedPushSyncMoments.set(uri, Date.now()),
      });
      observer.reopened(1);
      reopenedOnce = true;
      attemptRequest = {
        uri,
        synchronizationId: document.synchronizationId,
        evidenceRevision: document.evidenceRevision,
      };
      attemptSyncStart = Date.now();
      attemptMaxWaitMs = REOPEN_EVIDENCE_WAIT_MS;
    }
    observer.pushWaitCompleted(1, pushOutcome ?? "timed-out");
    return result;
  }
}

/** Return a workspace-relative diagnostic file path for telemetry identity. */
function relativeDiagnosticFile(cwd: string | undefined, filePath: string): string | undefined {
  if (cwd === undefined) return undefined;
  return path.relative(cwd, path.resolve(cwd, filePath));
}
