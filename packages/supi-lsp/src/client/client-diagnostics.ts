import { existsSync, readFileSync } from "node:fs";
import { type CodeQueryResult, unavailableCodeQuery } from "@mrclrchtr/supi-code-runtime/api";
import type {
  Diagnostic,
  DocumentDiagnosticReport,
  PublishDiagnosticsParams,
  TextDocumentIdentifier,
  TextDocumentItem,
  VersionedTextDocumentIdentifier,
} from "../config/types.ts";
import { detectLanguageId, fileToUri, uriToFile } from "../utils.ts";
import { collectSynchronizedFileDiagnostics } from "./client-diagnostic-collection.ts";
import {
  applyPullReport,
  type DiagnosticCacheEntry,
  type DiagnosticSynchronization,
  hasFreshEvidence,
  hasFreshPush,
  isCurrentSynchronization,
  latestFreshEvidenceReceivedAt,
  nextDocumentVersion,
  raceDiagnosticPull,
} from "./client-diagnostic-evidence.ts";
import {
  DiagnosticObserver,
  DiagnosticPullError,
  isDiagnosticTimeout,
} from "./client-diagnostic-timing.ts";
import { DiagnosticWaitRegistry } from "./client-diagnostic-waiters.ts";

const DIAGNOSTIC_WAIT_MS = 3_000;

type OpenDocument = { version: number; synchronizationId: number };

/** One file's stored diagnostics as consumed by manager-level collection. */
export interface DiagnosticEntry {
  uri: string;
  diagnostics: Diagnostic[];
}

interface ClientDiagnosticsHost {
  isOperational(): boolean;
  supportsPullDiagnostics(): boolean;
  sendNotification(method: string, params: unknown): void;
  pullDocumentDiagnostics(
    uri: string,
    previousResultId: string | undefined,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<DocumentDiagnosticReport | null>;
}

/**
 * Owns one LSP client's open documents, diagnostic cache, waiters, and refresh policy.
 *
 * The host supplies transport and readiness operations. Callers use `LspClient` as
 * the external seam and do not access this state directly.
 */
export class ClientDiagnostics {
  readonly #openDocs = new Map<string, OpenDocument>();
  readonly #diagnosticStore = new Map<string, DiagnosticCacheEntry>();
  readonly #waiters = new DiagnosticWaitRegistry();
  readonly #versionHistory = new Map<string, number>();
  #nextSynchronizationId = 0;

  constructor(private readonly host: ClientDiagnosticsHost) {}

  get openFiles(): string[] {
    return Array.from(this.#openDocs.keys()).map(uriToFile);
  }

  /** Release all waiters and remove all document and diagnostic state. */
  clear(): void {
    this.#openDocs.clear();
    this.#diagnosticStore.clear();
    this.#versionHistory.clear();
    this.#waiters.releaseAll();
    this.#waiters.cancelSettle();
  }

  /** Open a document, or update it when it is already open. */
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
    this.#openDocs.set(uri, { version, synchronizationId: ++this.#nextSynchronizationId });
    this.host.sendNotification("textDocument/didOpen", {
      textDocument: {
        uri,
        languageId,
        version,
        text: content,
      } satisfies TextDocumentItem,
    });
  }

  /** Update a document, or open it when it is not tracked yet. */
  didChange(filePath: string, content: string): void {
    if (!this.host.isOperational()) return;

    const uri = fileToUri(filePath);
    const doc = this.#openDocs.get(uri);
    if (!doc) {
      this.didOpen(filePath, content);
      return;
    }

    this.#waiters.releaseFile(uri);
    this.#waiters.cancelSettle();
    doc.version = nextDocumentVersion(this.#versionHistory, uri);
    doc.synchronizationId = ++this.#nextSynchronizationId;
    this.#sendDidChange(uri, doc.version, content);
  }

  /** Close a document and remove its cached diagnostic state. */
  didClose(filePath: string): void {
    const uri = fileToUri(filePath);
    const wasOpen = this.#openDocs.has(uri);
    this.#clearFileState(uri);

    if (wasOpen && this.host.isOperational()) {
      this.#sendDidClose(uri);
    }
  }

  /** Remove missing open documents and diagnostics, and return their file paths. */
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

  /** Return the current client version, or null when the document is not open. */
  getOpenDocumentVersion(filePath: string): number | null {
    return this.#openDocs.get(fileToUri(filePath))?.version ?? null;
  }

  getDiagnostics(filePath: string): Diagnostic[] {
    return this.#diagnosticStore.get(fileToUri(filePath))?.diagnostics ?? [];
  }

  /** Return non-empty diagnostics for files that still exist. */
  getAllDiagnostics(): DiagnosticEntry[] {
    const result: DiagnosticEntry[] = [];
    for (const [uri, entry] of this.#diagnosticStore) {
      if (entry.diagnostics.length === 0 || !existsSync(uriToFile(uri))) continue;
      result.push({ uri, diagnostics: entry.diagnostics });
    }
    return result;
  }

  /** Force the next pull refresh to request complete diagnostic reports. */
  clearPullResultIds(): void {
    for (const entry of this.#diagnosticStore.values()) delete entry.resultId;
  }

  /** Apply diagnostics received through `textDocument/publishDiagnostics`. */
  handlePublishDiagnostics(params: PublishDiagnosticsParams): void {
    const openDoc = this.#openDocs.get(params.uri);
    if (params.version !== undefined) {
      if (!Number.isInteger(params.version)) return;
      if (openDoc && params.version !== openDoc.version) return;
    }
    if (!Array.isArray(params.diagnostics)) return;

    this.#diagnosticStore.set(params.uri, {
      diagnostics: params.diagnostics,
      receivedAt: Date.now(),
      source: "push",
      synchronizationId: openDoc?.synchronizationId,
      version: params.version,
    });
    this.#waiters.releaseFile(params.uri, "published");
    this.#waiters.notifySettle();
  }

  /** Re-read open documents, then collect pull diagnostics or wait for push diagnostics. */
  async refreshOpenDiagnostics(
    options: { maxWaitMs?: number; quietMs?: number } = {},
  ): Promise<void> {
    const supportsPull = this.host.supportsPullDiagnostics();
    const observer = new DiagnosticObserver("refresh-open", supportsPull);
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
        await this.#pullDiagnosticsForOpenDocuments(synchronizations, syncStart, maxWaitMs);
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

  /** Sync one file and return diagnostics with explicit evidence availability. */
  async syncAndWaitForDiagnostics(
    filePath: string,
    content: string,
  ): Promise<CodeQueryResult<Diagnostic[]>> {
    const supportsPull = this.host.supportsPullDiagnostics();
    const observer = new DiagnosticObserver("sync-file", supportsPull);
    const uri = fileToUri(filePath);
    const cached = this.#diagnosticStore.get(uri);
    const cachedDiagnostics = cached ? [...cached.diagnostics] : null;
    const syncStart = Date.now();
    this.didChange(filePath, content);
    const synchronization = this.#openDocs.get(uri);
    observer.synchronized();
    if (!synchronization) {
      return unavailableCodeQuery("The document could not be synchronized for diagnostics.");
    }
    const request = { uri, synchronizationId: synchronization.synchronizationId };
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
        this.#pullDiagnosticsForUri(uri, timeoutMs, request.synchronizationId, signal),
    });
  }

  #resyncOpenDocuments(): DiagnosticSynchronization[] {
    const synchronizations: DiagnosticSynchronization[] = [];
    for (const [uri, doc] of this.#openDocs) {
      const filePath = uriToFile(uri);
      try {
        if (!existsSync(filePath)) {
          this.#clearFileState(uri);
          this.#sendDidClose(uri);
          continue;
        }
        const content = readFileSync(filePath, "utf-8");
        this.#waiters.releaseFile(uri);
        this.#waiters.cancelSettle();
        doc.version = nextDocumentVersion(this.#versionHistory, uri);
        doc.synchronizationId = ++this.#nextSynchronizationId;
        this.#sendDidChange(uri, doc.version, content);
        synchronizations.push({ uri, synchronizationId: doc.synchronizationId });
      } catch {
        // Keep the document open when a transient read fails.
      }
    }
    return synchronizations;
  }

  async #pullDiagnosticsForOpenDocuments(
    requests: DiagnosticSynchronization[],
    syncStart: number,
    maxWaitMs: number,
  ): Promise<void> {
    const deadline = syncStart + maxWaitMs;
    const results = await Promise.allSettled(
      requests.map(async (request) => {
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw new Error("pull diagnostic timeout");
        const pullController = new AbortController();
        const outcome = await raceDiagnosticPull({
          pull: this.#pullDiagnosticsForUri(
            request.uri,
            remaining,
            request.synchronizationId,
            pullController.signal,
          ),
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
    uri: string,
    timeoutMs: number,
    synchronizationId?: number,
    signal?: AbortSignal,
  ): Promise<boolean> {
    const previous = this.#diagnosticStore.get(uri);
    const previousResultId = previous?.resultId;
    const report = await this.host.pullDocumentDiagnostics(
      uri,
      previousResultId,
      timeoutMs,
      signal,
    );
    if (!report) return false;
    if (
      synchronizationId !== undefined &&
      !isCurrentSynchronization(this.#openDocs, { uri, synchronizationId })
    ) {
      return false;
    }
    return applyPullReport({
      store: this.#diagnosticStore,
      uri,
      report,
      previous,
      previousResultId,
      synchronizationId,
    });
  }

  #sendDidChange(uri: string, version: number, content: string): void {
    this.host.sendNotification("textDocument/didChange", {
      textDocument: { uri, version } satisfies VersionedTextDocumentIdentifier,
      contentChanges: [{ text: content }],
    });
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
