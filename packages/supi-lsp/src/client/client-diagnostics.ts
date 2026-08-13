import { existsSync } from "node:fs";
import {
  type CodeQueryResult,
  type CodeRequestControl,
  completedCodeQuery,
  unavailableCodeQuery,
} from "@mrclrchtr/supi-code-runtime/api";
import type {
  Diagnostic,
  PublishDiagnosticsParams,
  TextDocumentIdentifier,
  TextDocumentItem,
} from "../config/types.ts";
import { detectLanguageId, fileToUri, uriToFile } from "../utils.ts";
import { applyPushDiagnostics, buildClientDiagnosticSnapshot } from "./client-diagnostic-cache.ts";
import { collectSynchronizedFileDiagnostics } from "./client-diagnostic-collection.ts";
import {
  type DiagnosticCacheEntry,
  type DiagnosticSynchronization,
  hasFreshEvidence,
  hasFreshPush,
  isCurrentSynchronization,
  latestFreshEvidenceReceivedAt,
  nextDocumentVersion,
  raceDiagnosticPull,
} from "./client-diagnostic-evidence.ts";
import type { ClientDiagnosticsHost } from "./client-diagnostic-host.ts";
import { pullDiagnosticEvidence } from "./client-diagnostic-pull.ts";
import type { DiagnosticPullRequest } from "./client-diagnostic-request.ts";
import {
  DiagnosticObserver,
  DiagnosticPullError,
  isDiagnosticTimeout,
} from "./client-diagnostic-timing.ts";
import { DiagnosticWaitRegistry } from "./client-diagnostic-waiters.ts";
import {
  type ClientDiagnosticSnapshot,
  type DiagnosticEntry,
  fingerprintDocumentContent,
  hasCurrentDiagnosticEvidence,
  type OpenDocumentState,
} from "./client-document-state.ts";
import { resynchronizeOpenDocuments, synchronizeDocument } from "./client-document-sync.ts";

const DIAGNOSTIC_WAIT_MS = 3_000;
/** Own one client's document and diagnostic evidence; revisions prevent stale reuse. */
export class ClientDiagnostics {
  readonly #openDocs = new Map<string, OpenDocumentState>();
  readonly #diagnosticStore = new Map<string, DiagnosticCacheEntry>();
  readonly #waiters = new DiagnosticWaitRegistry();
  readonly #versionHistory = new Map<string, number>();
  #evidenceRevision = 0;
  #nextSynchronizationId = 0;
  #unversionedPushBlocked = false;

  constructor(private readonly host: ClientDiagnosticsHost) {}

  get openFiles(): string[] {
    return Array.from(this.#openDocs.keys()).map(uriToFile);
  }

  clear(): void {
    this.#openDocs.clear();
    this.#diagnosticStore.clear();
    this.#versionHistory.clear();
    this.#evidenceRevision++;
    this.#unversionedPushBlocked = false;
    this.#waiters.releaseAll();
    this.#waiters.cancelSettle();
  }

  didOpen(filePath: string, content: string): void {
    if (!this.host.isOperational()) return;

    const uri = fileToUri(filePath);
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

    synchronizeDocument({
      uri,
      content,
      document: doc,
      version: nextDocumentVersion(this.#versionHistory, uri),
      synchronizationId: ++this.#nextSynchronizationId,
      evidenceRevision: this.#evidenceRevision,
      waiters: this.#waiters,
      sendNotification: (method, params) => this.host.sendNotification(method, params),
    });
  }

  didClose(filePath: string): void {
    const uri = fileToUri(filePath);
    const wasOpen = this.#openDocs.has(uri);
    this.#clearFileState(uri);

    if (wasOpen && this.host.isOperational()) {
      this.#sendDidClose(uri);
    }
  }

  pruneMissingFiles(): string[] {
    const uris = new Set([...this.#openDocs.keys(), ...this.#diagnosticStore.keys()]);
    const removedFiles: string[] = [];

    for (const uri of uris) {
      const filePath = uriToFile(uri);
      if (existsSync(filePath)) continue;

      const wasOpen = this.#openDocs.has(uri);
      this.#clearFileState(uri);
      removedFiles.push(filePath);
      if (wasOpen && this.host.isOperational()) this.#sendDidClose(uri);
    }

    return removedFiles;
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
    this.#unversionedPushBlocked = true;
  }

  handlePublishDiagnostics(params: PublishDiagnosticsParams): void {
    if (
      !applyPushDiagnostics({
        store: this.#diagnosticStore,
        openDocuments: this.#openDocs,
        params,
        evidenceRevision: this.#evidenceRevision,
        unversionedBlocked: this.#unversionedPushBlocked,
      })
    ) {
      return;
    }
    this.#waiters.releaseFile(params.uri, "published");
    this.#waiters.notifySettle();
  }
  async refreshOpenDiagnostics(
    options: { maxWaitMs?: number; quietMs?: number } & CodeRequestControl = {},
  ): Promise<void> {
    const supportsPull = this.host.supportsPullDiagnostics();
    const observer = new DiagnosticObserver("refresh-open", supportsPull, options);
    if (!this.host.isOperational()) {
      observer.skipped(0);
      return;
    }

    const maxWaitMs = options.maxWaitMs ?? 3_000;
    const quietMs = options.quietMs ?? 200;
    const syncStart = Date.now();
    const synchronizations = this.#resyncOpenDocuments();
    const settleEpoch = this.#waiters.settleEpoch;
    observer.synchronized();
    const documentCount = synchronizations.length;
    if (documentCount === 0) {
      observer.skipped(0);
      return;
    }

    if (supportsPull) {
      try {
        await this.#pullDiagnosticsForOpenDocuments(
          synchronizations,
          syncStart,
          maxWaitMs,
          options.operationId,
        );
        observer.pullCompleted(documentCount);
        return;
      } catch (error) {
        observer.pullFailed(error);
      }
    }

    const settle = await this.#waiters.waitForSettle({
      syncStart,
      maxWaitMs,
      quietMs,
      settleEpoch,
      isComplete: () =>
        synchronizations.every((item) => hasFreshEvidence(this.#diagnosticStore, item)),
      latestReceived: () => latestFreshEvidenceReceivedAt(this.#diagnosticStore, synchronizations),
    });
    observer.pushSettled(documentCount, settle);
  }

  async syncAndWaitForDiagnostics(
    filePath: string,
    content: string,
    control?: CodeRequestControl,
  ): Promise<CodeQueryResult<Diagnostic[]>> {
    const supportsPull = this.host.supportsPullDiagnostics();
    const observer = new DiagnosticObserver("sync-file", supportsPull, control);
    const uri = fileToUri(filePath);
    const cached = this.#diagnosticStore.get(uri);
    const cachedDiagnostics = cached ? [...cached.diagnostics] : null;
    const syncStart = Date.now();
    const openDocument = this.#openDocs.get(uri);
    const contentUnchanged =
      openDocument?.contentFingerprint === fingerprintDocumentContent(content);
    if (
      !contentUnchanged ||
      !hasCurrentDiagnosticEvidence(openDocument, cached, this.#evidenceRevision)
    ) {
      this.#synchronizeDocument(filePath, content);
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
    const request = { uri, synchronizationId: synchronization.synchronizationId };
    const evidenceRevision = synchronization.evidenceRevision;
    return collectSynchronizedFileDiagnostics({
      supportsPull,
      syncStart,
      maxWaitMs: DIAGNOSTIC_WAIT_MS,
      request,
      cachedDiagnostics,
      observer,
      waiters: this.#waiters,
      current: () => isCurrentSynchronization(this.#openDocs, request),
      freshPush: () => hasFreshPush(this.#diagnosticStore, request),
      diagnostics: () => this.getDiagnostics(filePath),
      pullDiagnostics: (timeoutMs, signal) =>
        this.#pullDiagnosticsForUri({
          uri,
          timeoutMs,
          synchronizationId: request.synchronizationId,
          evidenceRevision,
          signal,
          operationId: control?.operationId,
        }),
    });
  }
  #synchronizeDocument(filePath: string, content: string): void {
    const uri = fileToUri(filePath);
    const doc = this.#openDocs.get(uri);
    if (!doc) {
      this.didOpen(filePath, content);
      return;
    }
    synchronizeDocument({
      uri,
      content,
      document: doc,
      version: nextDocumentVersion(this.#versionHistory, uri),
      synchronizationId: ++this.#nextSynchronizationId,
      evidenceRevision: this.#evidenceRevision,
      waiters: this.#waiters,
      sendNotification: (method, params) => this.host.sendNotification(method, params),
    });
  }
  #resyncOpenDocuments(): DiagnosticSynchronization[] {
    return resynchronizeOpenDocuments({
      openDocuments: this.#openDocs,
      waiters: this.#waiters,
      nextVersion: (uri) => nextDocumentVersion(this.#versionHistory, uri),
      nextSynchronizationId: () => ++this.#nextSynchronizationId,
      evidenceRevision: this.#evidenceRevision,
      sendNotification: (method, params) => this.host.sendNotification(method, params),
      uriToFile,
      clearFile: (uri) => this.#clearFileState(uri),
    });
  }
  async #pullDiagnosticsForOpenDocuments(
    requests: DiagnosticSynchronization[],
    syncStart: number,
    maxWaitMs: number,
    operationId?: string,
  ): Promise<void> {
    const deadline = syncStart + maxWaitMs;
    const results = await Promise.allSettled(
      requests.map(async (request) => {
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw new Error("pull diagnostic timeout");
        const pullController = new AbortController();
        const outcome = await raceDiagnosticPull({
          pull: this.#pullDiagnosticsForUri({
            uri: request.uri,
            timeoutMs: remaining,
            synchronizationId: request.synchronizationId,
            evidenceRevision:
              this.#openDocs.get(request.uri)?.evidenceRevision ?? this.#evidenceRevision,
            signal: pullController.signal,
            operationId,
          }),
          waitForChange: () => this.#waiters.waitForChange(),
          freshPush: () => hasFreshPush(this.#diagnosticStore, request),
          current: () => isCurrentSynchronization(this.#openDocs, request),
        });
        if (outcome !== "pull") pullController.abort();
        return outcome === "pull";
      }),
    );

    const incomplete = results.some((result) => result.status === "rejected" || !result.value);
    if (incomplete && requests.length > 0) {
      throw new DiagnosticPullError(
        results.some(
          (result) => result.status === "rejected" && isDiagnosticTimeout(result.reason),
        ),
      );
    }
  }

  async #pullDiagnosticsForUri(
    options: Omit<DiagnosticPullRequest, "previousResultId"> & {
      synchronizationId?: number;
      evidenceRevision?: number;
    },
  ): Promise<boolean> {
    const evidenceRevision = options.evidenceRevision ?? this.#evidenceRevision;
    const applied = await pullDiagnosticEvidence({
      store: this.#diagnosticStore,
      ...options,
      evidenceRevision,
      currentRevision: () => this.#evidenceRevision,
      isCurrentSynchronization: () =>
        options.synchronizationId === undefined ||
        isCurrentSynchronization(this.#openDocs, {
          uri: options.uri,
          synchronizationId: options.synchronizationId,
        }),
      pull: (request) => this.host.pullDocumentDiagnostics(request),
    });
    if (applied) this.#unversionedPushBlocked = false;
    return applied;
  }
  #sendDidClose(uri: string): void {
    this.host.sendNotification("textDocument/didClose", {
      textDocument: { uri } satisfies TextDocumentIdentifier,
    });
  }
  #clearFileState(uri: string): void {
    this.#openDocs.delete(uri);
    this.#diagnosticStore.delete(uri);
    this.#waiters.releaseFile(uri);
    this.#waiters.cancelSettle();
  }
}
