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
import { DiagnosticObserver } from "./client-diagnostic-timing.ts";
import { DiagnosticWaitRegistry } from "./client-diagnostic-waiters.ts";
import {
  type ClientDiagnosticSnapshot,
  type DiagnosticEntry,
  fingerprintDocumentContent,
  hasCurrentDiagnosticEvidence,
  type OpenDocumentState,
} from "./client-document-state.ts";
import { clearTrackedDocumentState, synchronizeTrackedDocument } from "./client-document-sync.ts";
import { getDiagnosticFileState } from "./client-file-state.ts";

const DIAGNOSTIC_WAIT_MS = 3_000;
/** Own one client's document and diagnostic evidence; revisions prevent stale reuse. */
export class ClientDiagnostics {
  readonly #openDocs = new Map<string, OpenDocumentState>();
  readonly #diagnosticStore = new Map<string, DiagnosticCacheEntry>();
  readonly #waiters = new DiagnosticWaitRegistry();
  readonly #versionHistory = new Map<string, number>();
  readonly #failedUris = new Set<string>();
  readonly #unversionedPushBlocked = new Set<string>();
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
        this.#unversionedPushBlocked.add(uri);
      }
    } else {
      this.#failedUris.clear();
    }
    this.#openDocs.clear();
    this.#diagnosticStore.clear();
    this.#versionHistory.clear();
    this.#evidenceRevision++;
    if (!options.preserveFailedDocuments) this.#unversionedPushBlocked.clear();
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
      blockUnversionedPush: () => this.#unversionedPushBlocked.add(uri),
      clearFailedFile: () => this.#failedUris.delete(uri),
      open: () => this.didOpen(filePath, content),
    });
  }

  didClose(filePath: string): void {
    const uri = fileToUri(filePath);
    const wasOpen = this.#openDocs.has(uri);
    this.#failedUris.delete(uri);
    this.#unversionedPushBlocked.add(uri);
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
      this.#unversionedPushBlocked.add(uri);
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
    this.#unversionedPushBlocked.add(uri);
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
    for (const uri of knownUris) this.#unversionedPushBlocked.add(uri);
  }

  handlePublishDiagnostics(params: unknown): void {
    if (!isValidPublishDiagnosticsParams(params)) return;
    if (
      !applyPushDiagnostics({
        store: this.#diagnosticStore,
        openDocuments: this.#openDocs,
        params,
        evidenceRevision: this.#evidenceRevision,
        unversionedBlocked: this.#unversionedPushBlocked.has(params.uri),
      })
    ) {
      return;
    }
    const document = this.#openDocs.get(params.uri);
    if (
      params.version !== undefined &&
      document &&
      params.version === document.version &&
      document.evidenceRevision === this.#evidenceRevision
    ) {
      this.#unversionedPushBlocked.delete(params.uri);
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
        this.#unversionedPushBlocked.add(uri);
        clearTrackedDocumentState(this.#openDocs, this.#diagnosticStore, this.#waiters, uri);
      },
      blockUnversionedPush: (uri) => this.#unversionedPushBlocked.add(uri),
      clearFailedFile: (uri) => this.#failedUris.delete(uri),
      unblockUnversionedPush: (uri) => this.#unversionedPushBlocked.delete(uri),
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
        blockUnversionedPush: () => this.#unversionedPushBlocked.add(uri),
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
    const evidenceRevision = synchronization.evidenceRevision;
    return collectSynchronizedFileDiagnostics(
      {
        supportsPull,
        syncStart,
        maxWaitMs: DIAGNOSTIC_WAIT_MS,
        request,
        cachedDiagnostics,
        observer,
        waiters: this.#waiters,
        current: () => isCurrentSynchronization(this.#openDocs, request),
        freshPush: () => hasFreshPush(this.#diagnosticStore, request, this.#evidenceRevision),
        diagnostics: () => this.getDiagnostics(filePath),
        pullDiagnostics: (timeoutMs, signal) =>
          pullClientDiagnosticEvidenceFromHost({
            host: this.host,
            store: this.#diagnosticStore,
            openDocuments: this.#openDocs,
            currentEvidenceRevision: () => this.#evidenceRevision,
            isRelatedUriTracked: (relatedUri) =>
              this.#openDocs.has(relatedUri) || this.#versionHistory.has(relatedUri),
            onApplied: () => this.#unversionedPushBlocked.delete(uri),
            request: {
              uri,
              timeoutMs,
              synchronizationId: request.synchronizationId,
              evidenceRevision,
              signal,
              deadline: control?.deadline,
              operationId: control?.operationId,
            },
          }),
      },
      control,
    );
  }
}

/** Return a workspace-relative diagnostic file path for telemetry identity. */
function relativeDiagnosticFile(cwd: string | undefined, filePath: string): string | undefined {
  if (cwd === undefined) return undefined;
  return path.relative(cwd, path.resolve(cwd, filePath));
}
