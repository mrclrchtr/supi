// biome-ignore-all lint/style/noExcessiveLinesPerFile: one client's document sync, diagnostics, refresh, and sync-file flow stay in one cohesive class.
import * as path from "node:path";
import {
  type CodeQueryResult,
  type CodeRequestControl,
  completedCodeQuery,
  throwIfCodeRequestInterrupted,
  unavailableCodeQuery,
} from "@mrclrchtr/supi-code-runtime/api";
import { fileToUri, uriToFile } from "@mrclrchtr/supi-core/path";
import type { Diagnostic, TextDocumentItem } from "../config/types.ts";
import type { DiagnosticEvidenceSummary } from "../diagnostics/evidence.ts";
import { detectLanguageId } from "../utils.ts";
import { applyPushDiagnostics, buildClientDiagnosticSnapshot } from "./client-diagnostic-cache.ts";
import { collectSynchronizedFileDiagnostics } from "./client-diagnostic-collection.ts";
import {
  type DiagnosticCacheEntry,
  type DiagnosticSynchronization,
  hasCurrentEvidence,
  isCurrentSynchronization,
  isValidPublishDiagnosticsParams,
  nextDocumentVersion,
} from "./client-diagnostic-evidence.ts";
import type { ClientDiagnosticsHost } from "./client-diagnostic-host.ts";
import { DiagnosticPublicationTracker } from "./client-diagnostic-publication.ts";
import { startDiagnosticEvidenceFromAdapter } from "./client-diagnostic-pull.ts";
import {
  refreshClientOpenDiagnostics,
  sendDidCloseNotification,
} from "./client-diagnostic-refresh.ts";
import {
  DiagnosticRequestInvalidatedError,
  DiagnosticRequestScheduler,
} from "./client-diagnostic-request.ts";
import { DiagnosticObserver } from "./client-diagnostic-timing.ts";
import { DiagnosticWaitRegistry } from "./client-diagnostic-waiters.ts";
import {
  type ClientDiagnosticSnapshot,
  type DiagnosticEntry,
  fingerprintDocumentContent,
  hasConfirmedDiagnosticEvidence,
  type OpenDocumentState,
} from "./client-document-state.ts";
import { clearTrackedDocumentState, synchronizeTrackedDocument } from "./client-document-sync.ts";
import { getDiagnosticFileState } from "./client-file-state.ts";

const DIAGNOSTIC_WAIT_MS = 3_000;
/** Bound abandoned adapter work without binding it to one caller's deadline. */
const DIAGNOSTIC_REQUEST_OWNER_TIMEOUT_MS = 30_000;
/** Own one client's document and diagnostic evidence; revisions prevent stale reuse. */
export class ClientDiagnostics {
  readonly #openDocs = new Map<string, OpenDocumentState>();
  readonly #diagnosticStore = new Map<string, DiagnosticCacheEntry>();
  readonly #waiters = new DiagnosticWaitRegistry();
  /** One shared, bounded request engine for this client route. */
  readonly #requestScheduler = new DiagnosticRequestScheduler();
  /** Invalidation signals for active per-file adapter collections. */
  readonly #requestControllers = new Map<string, AbortController>();
  readonly #versionHistory = new Map<string, number>();
  readonly #failedUris = new Set<string>();
  /** Bounded push-publication telemetry for one client's diagnostic state. */
  readonly #publications: DiagnosticPublicationTracker;
  /** Client-side sync moment per URI: unversioned pushes before it stay rejected. */
  readonly #unversionedPushSyncMoments = new Map<string, number>();
  /** URIs closed by a lifecycle operation: versioned pushes stay fail-closed. */
  readonly #closedVersionedBarrier = new Set<string>();
  #evidenceRevision = 0;
  #nextSynchronizationId = 0;

  constructor(private readonly host: ClientDiagnosticsHost) {
    this.#publications = new DiagnosticPublicationTracker({
      server: host.server,
      cwd: host.cwd,
    });
  }

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
    this.#cancelAllDiagnosticRequests();
  }

  didOpen(filePath: string, content: string): void {
    if (!this.host.isOperational()) return;

    const uri = fileToUri(filePath);
    this.#failedUris.delete(uri);
    if (this.#openDocs.has(uri)) {
      // An equivalent duplicate open is a no-op. A real content change is
      // cancelled by didChange before it advances the synchronization.
      this.didChange(filePath, content);
      return;
    }
    this.#cancelDiagnosticRequest(uri);

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
      content,
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
    this.#cancelDiagnosticRequest(uri);
    synchronizeTrackedDocument({
      uri,
      content,
      document: doc,
      nextVersion: () => nextDocumentVersion(this.#versionHistory, uri),
      nextSynchronizationId: () => ++this.#nextSynchronizationId,
      evidenceRevision: this.#evidenceRevision,
      incrementalSync: this.host.usesIncrementalDocumentSync(),
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
    this.#cancelDiagnosticRequest(uri);

    if (wasOpen && this.host.isOperational()) {
      sendDidCloseNotification(this.host, uri);
    }
  }

  pruneMissingFiles(): string[] {
    const uris = new Set([
      ...this.#openDocs.keys(),
      ...this.#diagnosticStore.keys(),
      ...this.#failedUris,
    ]);
    const removedFiles: string[] = [];

    for (const uri of uris) {
      const filePath = uriToFile(uri);
      if (getDiagnosticFileState(filePath) !== "removed") continue;

      const wasOpen = this.#openDocs.has(uri);
      this.#failedUris.delete(uri);
      this.#unversionedPushSyncMoments.delete(uri);
      this.#closedVersionedBarrier.add(uri);
      this.#cancelDiagnosticRequest(uri);
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
    this.#requestScheduler.clearPending();
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
      this.#cancelDiagnosticRequest(uri);
      this.#unversionedPushSyncMoments.set(uri, moment);
      this.#closedVersionedBarrier.add(uri);
    }
  }

  handlePublishDiagnostics(params: unknown): void {
    if (!isValidPublishDiagnosticsParams(params)) return;
    const previousEntry = this.#diagnosticStore.get(params.uri);
    const result = applyPushDiagnostics({
      store: this.#diagnosticStore,
      openDocuments: this.#openDocs,
      params,
      evidenceRevision: this.#evidenceRevision,
      unversionedSyncMoment: this.#unversionedPushSyncMoments.get(params.uri),
      closedVersionedBarrier: this.#closedVersionedBarrier.has(params.uri),
    });
    if (!result.accepted) return;
    const entry = this.#diagnosticStore.get(params.uri);
    if (
      entry !== previousEntry &&
      entry?.source === "push" &&
      entry.synchronizationId !== undefined &&
      entry.evidenceRevision !== undefined
    ) {
      this.#publications.record(
        params.uri,
        entry.synchronizationId,
        entry.evidenceRevision,
        entry.receivedAt,
      );
    }
    this.#waiters.releaseFile(params.uri, "observed");
    this.#waiters.notifySettle();
  }
  async refreshOpenDiagnostics(
    options: { maxWaitMs?: number; quietMs?: number } & CodeRequestControl = {},
  ): Promise<DiagnosticEvidenceSummary> {
    return this.#refreshOpenDiagnostics(options, false);
  }

  /** Force a full document resynchronization for a server refresh request. */
  async refreshForServerRequest(): Promise<DiagnosticEvidenceSummary> {
    return this.#refreshOpenDiagnostics({}, true);
  }

  async #refreshOpenDiagnostics(
    options: { maxWaitMs?: number; quietMs?: number } & CodeRequestControl,
    forceResynchronize: boolean,
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
        this.#cancelDiagnosticRequest(uri);
        this.#failedUris.add(uri);
        const document = this.#openDocs.get(uri);
        if (document) document.evidenceRevision = -1;
      },
      clearFile: (uri) => {
        this.#cancelDiagnosticRequest(uri);
        this.#failedUris.delete(uri);
        this.#unversionedPushSyncMoments.delete(uri);
        this.#closedVersionedBarrier.add(uri);
        clearTrackedDocumentState(this.#openDocs, this.#diagnosticStore, this.#waiters, uri);
      },
      markUnversionedSyncMoment: (uri) => {
        this.#cancelDiagnosticRequest(uri);
        this.#unversionedPushSyncMoments.set(uri, Date.now());
      },
      clearFailedFile: (uri) => this.#failedUris.delete(uri),
      requestDiagnostics: (requestOptions) =>
        this.#collectDiagnosticRequestEvidence({
          request: requestOptions.request,
          timeoutMs: requestOptions.timeoutMs,
          control: {
            signal: requestOptions.signal,
            deadline: requestOptions.deadline,
            operationId: requestOptions.operationId,
          },
          deadline: requestOptions.deadline,
          operationId: requestOptions.operationId,
        }),
      forceResynchronize,
      options,
      publications: {
        emitSummary: (summaryOptions) =>
          this.#publications.emitSummary({
            ...summaryOptions,
            identity: {
              server: this.host.server,
              cwd: this.host.cwd,
              ...summaryOptions.identity,
            },
          }),
      },
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
    const uri = fileToUri(filePath);
    const requestAdapter = this.host.diagnosticRequestAdapter.supports(uri)
      ? this.host.diagnosticRequestAdapter
      : undefined;
    const observer = new DiagnosticObserver("sync-file", requestAdapter !== undefined, control, {
      server: this.host.server,
      cwd: this.host.cwd,
      file: relativeDiagnosticFile(this.host.cwd, filePath),
    });
    const cached = this.#diagnosticStore.get(uri);
    const cachedDiagnostics = cached ? [...cached.diagnostics] : null;
    const syncStart = Date.now();
    const openDocument = this.#openDocs.get(uri);
    const contentUnchanged =
      openDocument?.contentFingerprint === fingerprintDocumentContent(content);
    const synchronizationCurrent = openDocument?.evidenceRevision === this.#evidenceRevision;
    // Equivalent content joins the current synchronization. Cached evidence
    // cannot force a no-op didChange that cancels an in-flight push or pull.
    if (!contentUnchanged || !synchronizationCurrent) {
      // A direct sync-file request can supersede an active collection just as
      // didChange and refresh do. Keep the raw request occupied until it
      // settles, but stop its obsolete diagnostic phases now.
      this.#cancelDiagnosticRequest(uri);
      synchronizeTrackedDocument({
        uri,
        content,
        document: this.#openDocs.get(uri),
        nextVersion: () => nextDocumentVersion(this.#versionHistory, uri),
        nextSynchronizationId: () => ++this.#nextSynchronizationId,
        evidenceRevision: this.#evidenceRevision,
        incrementalSync: this.host.usesIncrementalDocumentSync(),
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
      hasConfirmedDiagnosticEvidence(synchronization, cached, this.#evidenceRevision)
    ) {
      observer.cacheReused(1);
      return completedCodeQuery(cachedDiagnostics ?? []);
    }
    const request = {
      uri,
      synchronizationId: synchronization.synchronizationId,
      evidenceRevision: synchronization.evidenceRevision,
    };
    return this.#collectFileDiagnostics(
      {
        filePath,
        uri,
        requestAdapter,
        syncStart,
        request,
        cachedDiagnostics,
        observer,
      },
      control,
    );
  }

  /** Collect diagnostics for one synchronized document. */
  async #collectFileDiagnostics(
    options: {
      filePath: string;
      uri: string;
      requestAdapter: ClientDiagnosticsHost["diagnosticRequestAdapter"] | undefined;
      syncStart: number;
      request: DiagnosticSynchronization;
      cachedDiagnostics: Diagnostic[] | null;
      observer: DiagnosticObserver;
    },
    control?: CodeRequestControl,
  ): Promise<CodeQueryResult<Diagnostic[]>> {
    const { filePath, uri, requestAdapter, syncStart, request, cachedDiagnostics, observer } =
      options;
    const result = await collectSynchronizedFileDiagnostics(
      {
        requestDiagnostics: requestAdapter
          ? (timeoutMs, deadline, requestControl) =>
              this.#collectDiagnosticRequestEvidence({
                request,
                timeoutMs,
                control: requestControl,
                deadline,
                operationId: control?.operationId,
              })
          : undefined,
        requestSource: requestAdapter?.sourceFor(uri),
        syncStart,
        maxWaitMs: DIAGNOSTIC_WAIT_MS,
        request,
        cachedDiagnostics,
        observer,
        waiters: this.#waiters,
        current: () => isCurrentSynchronization(this.#openDocs, request),
        currentPushObservation: () => {
          const entry = this.#diagnosticStore.get(request.uri);
          return entry?.source === "push" &&
            hasCurrentEvidence(this.#diagnosticStore, request, this.#evidenceRevision)
            ? { receivedAt: entry.receivedAt, hasDiagnostics: entry.diagnostics.length > 0 }
            : undefined;
        },
        diagnostics: () => this.getDiagnostics(filePath),
      },
      control,
    );
    this.#publications.emitSummary({
      operation: "sync-file",
      identity: {
        server: this.host.server,
        cwd: this.host.cwd,
        file: relativeDiagnosticFile(this.host.cwd, filePath),
      },
      synchronizations: [
        {
          uri,
          synchronizationId: request.synchronizationId,
          evidenceRevision: request.evidenceRevision ?? this.#evidenceRevision,
          confirmed: result.kind === "completed",
        },
      ],
      operationId: control?.operationId,
    });
    return result;
  }

  /** Start one shared request and apply its report through the evidence gate. */
  #collectDiagnosticRequestEvidence(options: {
    request: DiagnosticSynchronization;
    timeoutMs: number;
    control?: CodeRequestControl;
    deadline?: number;
    operationId?: string;
  }): Promise<boolean> {
    const adapter = this.host.diagnosticRequestAdapter;
    if (!adapter?.supports(options.request.uri)) return Promise.resolve(false);
    const key = [
      options.request.uri,
      options.request.synchronizationId,
      options.request.evidenceRevision ?? this.#evidenceRevision,
    ].join("\x00");
    const consumerDeadline =
      options.deadline ??
      (Number.isFinite(options.timeoutMs) ? Date.now() + options.timeoutMs : undefined);
    const consumerControl: CodeRequestControl = {
      signal: options.control?.signal,
      ...(consumerDeadline !== undefined ? { deadline: consumerDeadline } : {}),
    };
    return this.#requestScheduler.run(
      key,
      () => {
        if (!isCurrentSynchronization(this.#openDocs, options.request)) {
          return { result: Promise.resolve(false), settled: Promise.resolve() };
        }
        const controller = new AbortController();
        this.#requestControllers.set(options.request.uri, controller);
        // The scheduler already races each caller against its own control.
        // Keep the adapter job alive after that race so another caller can
        // join the same underlying request. Its owner bound is independent
        // of the first caller's deadline.
        const ownerTimeoutMs = Number.isFinite(options.timeoutMs)
          ? Math.max(options.timeoutMs, DIAGNOSTIC_REQUEST_OWNER_TIMEOUT_MS)
          : DIAGNOSTIC_REQUEST_OWNER_TIMEOUT_MS;
        const request = {
          uri: options.request.uri,
          previousResultId: this.#diagnosticStore.get(options.request.uri)?.resultId,
          timeoutMs: ownerTimeoutMs,
          signal: controller.signal,
          operationId: options.operationId,
        };
        const execution = startDiagnosticEvidenceFromAdapter({
          adapter,
          request,
          store: this.#diagnosticStore,
          synchronizationId: options.request.synchronizationId,
          evidenceRevision: options.request.evidenceRevision ?? this.#evidenceRevision,
          currentRevision: () => this.#evidenceRevision,
          isCurrentSynchronization: () => isCurrentSynchronization(this.#openDocs, options.request),
          isRelatedUriTracked: (uri) => this.#openDocs.has(uri) || this.#versionHistory.has(uri),
        });
        void execution.settled
          .finally(() => {
            if (this.#requestControllers.get(options.request.uri) === controller) {
              this.#requestControllers.delete(options.request.uri);
            }
          })
          .catch(() => {});
        return execution;
      },
      consumerControl,
    );
  }

  #cancelDiagnosticRequest(uri: string): void {
    this.#requestControllers
      .get(uri)
      ?.abort(new DiagnosticRequestInvalidatedError("Diagnostic request was superseded."));
    const prefix = `${uri}\x00`;
    this.#requestScheduler.clearPendingWhere((key) => key.startsWith(prefix));
  }

  #cancelAllDiagnosticRequests(): void {
    for (const controller of this.#requestControllers.values()) {
      controller.abort(new DiagnosticRequestInvalidatedError());
    }
    this.#requestScheduler.clearPending();
  }
}

/** Return a workspace-relative diagnostic file path for telemetry identity. */
function relativeDiagnosticFile(cwd: string | undefined, filePath: string): string | undefined {
  if (cwd === undefined) return undefined;
  return path.relative(cwd, path.resolve(cwd, filePath));
}
