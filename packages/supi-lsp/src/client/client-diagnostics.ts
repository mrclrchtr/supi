// biome-ignore-all lint/style/noExcessiveLinesPerFile: one client's document sync, diagnostics, refresh, and sync-file flow stay in one cohesive class.
import * as path from "node:path";
import {
  type CodeQueryResult,
  type CodeRequestControl,
  completedCodeQuery,
  isCodeRequestInterruption,
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
  hasFreshEvidence,
  incompleteDiagnosticResult,
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
import { SemanticInputRequestRetryGuard } from "./client-request-enrollment.ts";
import {
  SemanticInputBarrier,
  type SemanticInputDocument,
  type SemanticInputSnapshot,
  type SemanticInputUpdate,
} from "./client-semantic-input-barrier.ts";
import type {
  SemanticInputChangeKind,
  SemanticInputSynchronizationError,
} from "./client-semantic-input-errors.ts";
import { isSemanticInputEnrollmentError } from "./client-semantic-input-errors.ts";

const DIAGNOSTIC_WAIT_MS = 3_000;
/** Bound rejoin attempts for one synchronization pass, separate from request retries. */
const MAX_SEMANTIC_INPUT_SYNCHRONIZATION_RETRIES = 1;

/** Bound abandoned adapter work without binding it to one caller's deadline. */
const DIAGNOSTIC_REQUEST_OWNER_TIMEOUT_MS = 30_000;

interface ServerDiagnosticRefreshWork {
  promise: Promise<DiagnosticEvidenceSummary>;
}

type DiagnosticEvidenceCandidate = DiagnosticSynchronization & {
  readonly evidenceRevision: number;
};

interface DiagnosticQueryAttemptState {
  inputRevision: number | undefined;
}

function unavailableAfterEnrollmentRetry(error: unknown): CodeQueryResult<Diagnostic[]> {
  const detail = error instanceof Error ? error.message : String(error);
  return unavailableCodeQuery(`Diagnostic collection failed closed: ${detail}`);
}

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
  readonly #inputBarrier: SemanticInputBarrier;
  #evidenceRevision = 0;
  #nextSynchronizationId = 0;
  /** One active server refresh plus one coalesced newer demand generation. */
  #serverRefreshGeneration = 0;
  #serverRefreshWork: ServerDiagnosticRefreshWork | undefined;

  constructor(private readonly host: ClientDiagnosticsHost) {
    this.#publications = new DiagnosticPublicationTracker({
      server: host.server,
      cwd: host.cwd,
    });
    this.#inputBarrier = new SemanticInputBarrier({
      isOperational: () => this.host.isOperational(),
      getOpenDocuments: () => this.#getSemanticInputDocuments(),
      applyDocumentUpdates: (updates) => this.#applySemanticInputUpdates(updates),
      closeMissingDocument: (filePath) => this.didClose(filePath),
      markUnreadableDocument: (filePath) => this.markFailedFile(filePath),
    });
  }

  /** Synchronize all open document inputs, rejoining once after a new enrollment. */
  async synchronizeSemanticInputs(
    control?: CodeRequestControl,
    contentOverrides?: ReadonlyMap<string, string>,
  ): Promise<SemanticInputSnapshot> {
    throwIfCodeRequestInterrupted(control);
    for (let synchronizationRetry = 0; ; synchronizationRetry++) {
      try {
        return await this.#inputBarrier.synchronize(control, contentOverrides);
      } catch (error) {
        if (
          synchronizationRetry >= MAX_SEMANTIC_INPUT_SYNCHRONIZATION_RETRIES ||
          !isSemanticInputEnrollmentError(error) ||
          !this.host.isOperational()
        ) {
          throw error;
        }
        throwIfCodeRequestInterrupted(control);
      }
    }
  }

  /** Return the current typed input change after a request revision, when present. */
  getSemanticInputChangeSince(revision: number): SemanticInputSynchronizationError | undefined {
    return this.#inputBarrier.getChangeSince(
      revision,
      "Semantic input changed while the request was running.",
    );
  }

  /** Fail closed when a semantic request observes a changed input generation. */
  assertSemanticInputsCurrent(
    snapshot: SemanticInputSnapshot,
    control?: CodeRequestControl,
    contentOverrides?: ReadonlyMap<string, string>,
  ): Promise<void> {
    throwIfCodeRequestInterrupted(control);
    return this.#inputBarrier.assertCurrent(snapshot, control, contentOverrides);
  }

  #getSemanticInputDocuments(): SemanticInputDocument[] {
    return Array.from(this.#openDocs, ([uri, document]) => ({
      uri,
      filePath: uriToFile(uri),
      content: document.content,
      contentFingerprint: document.contentFingerprint,
    }));
  }

  #applySemanticInputUpdates(updates: readonly SemanticInputUpdate[]): void {
    if (updates.length === 0) return;
    this.#advanceEvidenceRevision();
    for (const update of updates) {
      const document = this.#openDocs.get(update.document.uri);
      if (!document) throw new Error("Semantic input changed while synchronization was running.");
      this.#synchronizeTrackedDocument(
        update.document.uri,
        update.document.filePath,
        update.content,
        document,
      );
      this.#failedUris.delete(update.document.uri);
    }
  }

  /** Apply one tracked-document change with the shared client state. */
  #synchronizeTrackedDocument(
    uri: string,
    filePath: string,
    content: string,
    document: OpenDocumentState,
  ): void {
    synchronizeTrackedDocument({
      uri,
      content,
      document,
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

  #initializeDocumentContent(uri: string, content: string): void {
    this.#inputBarrier.initializeDocumentContent(uri, content);
  }

  #observeDiskContent(uri: string, content: string): void {
    this.#inputBarrier.observeDiskContent(uri, content);
  }

  #forgetDocumentContent(uri: string): void {
    this.#inputBarrier.forgetDocumentContent(uri);
  }

  #ensureExplicitDocumentContent(
    filePath: string,
    content: string,
    contentIsAuthoritative: boolean,
  ): void {
    const uri = fileToUri(filePath);
    const document = this.#openDocs.get(uri);
    if (!document) {
      // An untracked file needs an initial protocol document before its barrier
      // read can verify the manager's content.
      this.didOpen(filePath, content);
      return;
    }
    // Manager reads are not authoritative: an already tracked document can
    // change between that read and the barrier's verified read.
    if (
      !contentIsAuthoritative ||
      document.contentFingerprint === fingerprintDocumentContent(content)
    ) {
      return;
    }
    this.#cancelDiagnosticRequest(uri);
    this.didChange(filePath, content);
  }

  #getDiagnosticContentOverrides(
    uri: string,
    content: string,
    contentIsAuthoritative: boolean,
  ): ReadonlyMap<string, string> | undefined {
    return contentIsAuthoritative ? new Map([[uri, content]]) : undefined;
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
    this.#inputBarrier.clear();
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
    this.#initializeDocumentContent(uri, content);
    this.#cancelDiagnosticRequest(uri);
    this.#advanceInputRevision(false, false, "enrollment");

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
    this.#advanceInputRevision();
    this.#synchronizeTrackedDocument(uri, filePath, content, doc);
  }

  didClose(filePath: string): void {
    const uri = fileToUri(filePath);
    const wasOpen = this.#openDocs.has(uri);
    const hadState =
      wasOpen ||
      this.#diagnosticStore.has(uri) ||
      this.#failedUris.has(uri) ||
      this.#versionHistory.has(uri);
    if (hadState) this.#advanceInputRevision(true, true, "close");
    this.#failedUris.delete(uri);
    this.#forgetDocumentContent(uri);
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
      this.#advanceInputRevision(true, true, "close");
      this.#failedUris.delete(uri);
      this.#forgetDocumentContent(uri);
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
    if (!this.#failedUris.has(uri)) this.#advanceInputRevision(true, true, "failure");
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
    this.#advanceInputRevision();
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
    // The refresh helper owns its read, classification, and budget pass. Do
    // not run the query barrier first: one changed file could then invalidate
    // the whole maintenance generation and resend unchanged text.
    return this.#refreshOpenDiagnostics(options);
  }

  /**
   * Refresh evidence after a server request without pretending input changed.
   *
   * A newer request invalidates the active evidence and joins the same owned
   * work. The next pass starts only after active diagnostic transport settles.
   */
  refreshForServerRequest(): Promise<DiagnosticEvidenceSummary> {
    this.#serverRefreshGeneration++;
    this.#invalidateDiagnosticEvidenceForServerRequest();
    const active = this.#serverRefreshWork;
    if (active) return active.promise;

    const work: ServerDiagnosticRefreshWork = {
      promise: undefined as unknown as Promise<DiagnosticEvidenceSummary>,
    };
    this.#serverRefreshWork = work;
    work.promise = this.#runServerDiagnosticRefresh(work);
    void work.promise.catch(() => {});
    return work.promise;
  }

  async #runServerDiagnosticRefresh(
    work: ServerDiagnosticRefreshWork,
  ): Promise<DiagnosticEvidenceSummary> {
    for (;;) {
      const generation = this.#serverRefreshGeneration;
      try {
        const evidence = await this.#refreshOpenDiagnostics({});
        if (generation === this.#serverRefreshGeneration) {
          if (this.#serverRefreshWork === work) this.#serverRefreshWork = undefined;
          return evidence;
        }
      } catch (error) {
        if (generation === this.#serverRefreshGeneration) {
          if (this.#serverRefreshWork === work) this.#serverRefreshWork = undefined;
          throw error;
        }
      }
    }
  }

  async #refreshOpenDiagnostics(
    options: { maxWaitMs?: number; quietMs?: number } & CodeRequestControl,
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
      noteInputContentChange: () => this.#noteInputContentChange(),
      observeDiskContent: (uri, content) => this.#observeDiskContent(uri, content),
      invalidateEvidence: (uri) => {
        this.#advanceInputRevision(false, true, "failure");
        this.#cancelDiagnosticRequest(uri);
        this.#failedUris.add(uri);
        // Keep old diagnostics as partial data, but do not let unchanged
        // recovery restore their former confirmation generation.
        const entry = this.#diagnosticStore.get(uri);
        if (entry) entry.evidenceRevision = -1;
        const document = this.#openDocs.get(uri);
        if (document) document.evidenceRevision = -1;
      },
      clearFile: (uri) => {
        this.#advanceInputRevision(false, true, "close");
        this.#cancelDiagnosticRequest(uri);
        this.#forgetDocumentContent(uri);
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
    options: { contentIsAuthoritative?: boolean } = {},
  ): Promise<CodeQueryResult<Diagnostic[]>> {
    // Reject immediately when the request was already cancelled: no document
    // synchronization or protocol traffic may start for a caller that no
    // longer awaits a result.
    throwIfCodeRequestInterrupted(control);
    const uri = fileToUri(filePath);
    const contentIsAuthoritative = options.contentIsAuthoritative !== false;
    this.#ensureExplicitDocumentContent(filePath, content, contentIsAuthoritative);
    const contentOverrides = this.#getDiagnosticContentOverrides(
      uri,
      content,
      contentIsAuthoritative,
    );
    return this.#runDiagnosticQueryWithEnrollmentRetry({
      filePath,
      content,
      uri,
      control,
      contentOverrides,
    });
  }

  async #runDiagnosticQueryWithEnrollmentRetry(options: {
    filePath: string;
    content: string;
    uri: string;
    control?: CodeRequestControl;
    contentOverrides: ReadonlyMap<string, string> | undefined;
  }): Promise<CodeQueryResult<Diagnostic[]>> {
    const retryGuard = new SemanticInputRequestRetryGuard((revision) =>
      this.getSemanticInputChangeSince(revision),
    );
    for (;;) {
      const attempt: DiagnosticQueryAttemptState = { inputRevision: undefined };
      try {
        retryGuard.assertCurrent();
        return await this.#runDiagnosticQueryAttempt({
          ...options,
          retryGuard,
          reuseCachedEvidence: !retryGuard.hasRetried,
          attempt,
        });
      } catch (error) {
        throwIfCodeRequestInterrupted(options.control);
        if (isSemanticInputEnrollmentError(error)) {
          // Enrollment can change cross-file diagnostics. Invalidate only the
          // evidence generation; the new request key queues behind owned
          // transport instead of joining an active obsolete request.
          this.#invalidateDiagnosticEvidenceAfterEnrollment();
        }
        const decision = retryGuard.decide(error, attempt.inputRevision);
        if (decision.kind === "retry") {
          throwIfCodeRequestInterrupted(options.control);
          continue;
        }
        return unavailableAfterEnrollmentRetry(decision.error);
      }
    }
  }

  /** Run one diagnostic synchronization and evidence attempt. */
  async #runDiagnosticQueryAttempt(options: {
    filePath: string;
    content: string;
    uri: string;
    control?: CodeRequestControl;
    contentOverrides: ReadonlyMap<string, string> | undefined;
    reuseCachedEvidence: boolean;
    retryGuard: SemanticInputRequestRetryGuard;
    attempt: DiagnosticQueryAttemptState;
  }): Promise<CodeQueryResult<Diagnostic[]>> {
    const {
      filePath,
      content,
      uri,
      control,
      contentOverrides,
      reuseCachedEvidence,
      retryGuard,
      attempt,
    } = options;
    retryGuard.assertCurrent();
    const synchronized = await this.#synchronizeDiagnosticInputs(uri, control, contentOverrides);
    if ("kind" in synchronized) return synchronized;
    const inputSnapshot = synchronized;
    attempt.inputRevision = inputSnapshot.revision;
    throwIfCodeRequestInterrupted(control);
    retryGuard.assertCurrent();
    const inputRevision = inputSnapshot.revision;
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
    const synchronization = this.#openDocs.get(uri);
    observer.synchronized();
    if (!synchronization) {
      return unavailableCodeQuery(
        this.#closedVersionedBarrier.has(uri)
          ? "Diagnostic collection ended before the current document synchronization was confirmed."
          : "The document could not be synchronized for diagnostics.",
      );
    }
    if (
      reuseCachedEvidence &&
      contentUnchanged &&
      hasConfirmedDiagnosticEvidence(synchronization, cached, this.#evidenceRevision)
    ) {
      observer.cacheReused(1);
      return this.#verifyDiagnosticInputs({
        result: completedCodeQuery(cachedDiagnostics ?? []),
        snapshot: inputSnapshot,
        control,
        contentOverrides,
        uri,
        diagnosticEvidence: this.#captureDiagnosticEvidence({
          uri,
          synchronizationId: synchronization.synchronizationId,
          evidenceRevision: synchronization.evidenceRevision,
        }),
      });
    }
    const requestEvidenceRevision =
      synchronization.evidenceRevision === this.#evidenceRevision
        ? synchronization.evidenceRevision
        : undefined;
    const request = {
      uri,
      synchronizationId: synchronization.synchronizationId,
      ...(requestEvidenceRevision !== undefined
        ? { evidenceRevision: requestEvidenceRevision }
        : {}),
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
        inputRevision,
        contentOverrides,
      },
      control,
    );
  }

  async #synchronizeDiagnosticInputs(
    uri: string,
    control: CodeRequestControl | undefined,
    contentOverrides: ReadonlyMap<string, string> | undefined,
  ): Promise<SemanticInputSnapshot | CodeQueryResult<Diagnostic[]>> {
    try {
      return await this.synchronizeSemanticInputs(control, contentOverrides);
    } catch (error) {
      if (isCodeRequestInterruption(error, control)) throw error;
      if (this.#closedVersionedBarrier.has(uri)) {
        return unavailableCodeQuery(
          "Diagnostic collection ended before the current document synchronization was confirmed.",
        );
      }
      const detail = error instanceof Error ? error.message : String(error);
      return unavailableCodeQuery(`Semantic input synchronization failed: ${detail}`);
    }
  }

  async #verifyDiagnosticInputs(options: {
    result: CodeQueryResult<Diagnostic[]>;
    snapshot: SemanticInputSnapshot;
    control: CodeRequestControl | undefined;
    contentOverrides: ReadonlyMap<string, string> | undefined;
    uri: string;
    diagnosticEvidence?: DiagnosticEvidenceCandidate;
  }): Promise<CodeQueryResult<Diagnostic[]>> {
    try {
      await this.assertSemanticInputsCurrent(
        options.snapshot,
        options.control,
        options.contentOverrides,
      );
      if (
        options.result.kind === "completed" &&
        (!options.diagnosticEvidence ||
          !this.#isDiagnosticEvidenceCurrent(options.diagnosticEvidence))
      ) {
        return incompleteDiagnosticResult(options.result.data, "timed-out");
      }
      return options.result;
    } catch (error) {
      if (isCodeRequestInterruption(error, options.control)) throw error;
      if (isSemanticInputEnrollmentError(error)) throw error;
      if (options.result.kind === "unavailable" && this.#closedVersionedBarrier.has(options.uri)) {
        return options.result;
      }
      const detail = error instanceof Error ? error.message : String(error);
      return unavailableCodeQuery(`Diagnostic collection failed closed: ${detail}`);
    }
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
      inputRevision: number;
      contentOverrides: ReadonlyMap<string, string> | undefined;
    },
    control?: CodeRequestControl,
  ): Promise<CodeQueryResult<Diagnostic[]>> {
    const { filePath, uri, requestAdapter, syncStart, request, cachedDiagnostics, observer } =
      options;
    const collected = await collectSynchronizedFileDiagnostics(
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
    const result = await this.#verifyDiagnosticInputs({
      result: collected,
      snapshot: { revision: options.inputRevision },
      control,
      contentOverrides: options.contentOverrides,
      uri,
      // Capture the candidate before the final input barrier can await a read.
      // The candidate must not follow the mutable document revision.
      diagnosticEvidence:
        collected.kind === "completed"
          ? this.#captureDiagnosticEvidence({
              uri: request.uri,
              synchronizationId: request.synchronizationId,
              evidenceRevision: request.evidenceRevision ?? this.#evidenceRevision,
            })
          : undefined,
    });
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

  /** Capture immutable identity for one request-confirmed diagnostic result. */
  #captureDiagnosticEvidence(options: {
    uri: string;
    synchronizationId: number;
    evidenceRevision: number;
  }): DiagnosticEvidenceCandidate | undefined {
    const entry = this.#diagnosticStore.get(options.uri);
    if (
      !entry ||
      entry.source === "push" ||
      entry.synchronizationId !== options.synchronizationId ||
      entry.evidenceRevision !== options.evidenceRevision ||
      options.evidenceRevision !== this.#evidenceRevision
    ) {
      return undefined;
    }
    return {
      uri: options.uri,
      synchronizationId: options.synchronizationId,
      evidenceRevision: options.evidenceRevision,
    };
  }

  /** Check a captured diagnostic result against the current live evidence. */
  #isDiagnosticEvidenceCurrent(candidate: DiagnosticEvidenceCandidate): boolean {
    return (
      candidate.evidenceRevision === this.#evidenceRevision &&
      isCurrentSynchronization(this.#openDocs, candidate) &&
      hasFreshEvidence(this.#diagnosticStore, candidate, this.#evidenceRevision)
    );
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
          markEvidenceCurrent: (_uri, synchronizationId) => {
            const document = this.#openDocs.get(options.request.uri);
            if (
              document &&
              synchronizationId !== undefined &&
              document.synchronizationId === synchronizationId
            ) {
              document.evidenceRevision =
                options.request.evidenceRevision ?? this.#evidenceRevision;
            }
          },
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

  #noteInputContentChange(): number {
    this.#advanceInputRevision();
    return this.#evidenceRevision;
  }

  /** Invalidate diagnostic evidence without advancing the semantic input generation. */
  #invalidateDiagnosticEvidenceForServerRequest(): void {
    // Keep active adapter work owned until it settles. The refresh generation
    // below discards its evidence and starts the newer pass afterwards.
    this.#advanceEvidenceRevision(false);
    this.#waiters.cancelSettle();
  }

  #advanceInputRevision(
    invalidateEvidence = true,
    cancelRequests = true,
    changeKind: SemanticInputChangeKind = "content",
  ): void {
    this.#inputBarrier.noteInputChange(changeKind);
    if (invalidateEvidence) this.#advanceEvidenceRevision(false);
    if (cancelRequests) this.#cancelAllDiagnosticRequests();
  }

  #advanceEvidenceRevision(cancelRequests = true): void {
    this.#evidenceRevision++;
    for (const document of this.#openDocs.values()) {
      document.evidenceRevision = this.#evidenceRevision;
    }
    if (cancelRequests) this.#cancelAllDiagnosticRequests();
  }

  /** Invalidate enrollment-stale evidence without cancelling owned transport. */
  #invalidateDiagnosticEvidenceAfterEnrollment(): void {
    this.#advanceEvidenceRevision(false);
    this.#waiters.cancelSettle();
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
