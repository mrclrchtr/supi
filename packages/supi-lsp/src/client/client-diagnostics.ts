// LSP client document synchronization and diagnostic state.

import { existsSync, readFileSync } from "node:fs";
import type {
  Diagnostic,
  DocumentDiagnosticReport,
  PublishDiagnosticsParams,
  TextDocumentIdentifier,
  TextDocumentItem,
  VersionedTextDocumentIdentifier,
} from "../config/types.ts";
import { detectLanguageId, fileToUri, uriToFile } from "../utils.ts";

const DIAGNOSTIC_WAIT_MS = 3_000;

type OpenDocument = { version: number };

type DiagnosticCacheEntry = {
  diagnostics: Diagnostic[];
  receivedAt: number;
  version?: number;
  resultId?: string;
};

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
  readonly #diagnosticWaiters = new Map<string, Array<() => void>>();

  constructor(private readonly host: ClientDiagnosticsHost) {}

  get openFiles(): string[] {
    return Array.from(this.#openDocs.keys()).map(uriToFile);
  }

  /** Release all waiters and remove all document and diagnostic state. */
  clear(): void {
    this.#openDocs.clear();
    this.#diagnosticStore.clear();
    this.#releaseAllDiagnosticWaiters();
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
    this.#openDocs.set(uri, { version: 1 });
    this.host.sendNotification("textDocument/didOpen", {
      textDocument: {
        uri,
        languageId,
        version: 1,
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

    doc.version++;
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
    if (params.version !== undefined && params.version !== null) {
      const openDoc = this.#openDocs.get(params.uri);
      if (openDoc && params.version < openDoc.version) return;
    }

    this.#diagnosticStore.set(params.uri, {
      diagnostics: params.diagnostics,
      receivedAt: Date.now(),
      version: params.version ?? undefined,
    });
    this.#releaseDiagnosticWaiters(params.uri);
  }

  /** Re-read open documents, then collect pull diagnostics or wait for push diagnostics. */
  async refreshOpenDiagnostics(
    options: { maxWaitMs?: number; quietMs?: number } = {},
  ): Promise<void> {
    if (!this.host.isOperational()) return;

    const maxWaitMs = options.maxWaitMs ?? 3_000;
    const quietMs = options.quietMs ?? 200;
    const syncStart = Date.now();

    this.#resyncOpenDocuments();
    if (this.#openDocs.size === 0) return;

    if (this.host.supportsPullDiagnostics()) {
      try {
        await this.#pullDiagnosticsForOpenDocuments(syncStart, maxWaitMs);
        return;
      } catch {
        // Pull diagnostics failed. Wait for push diagnostics instead.
      }
    }

    await this.#waitForDiagnosticSettle(syncStart, maxWaitMs, quietMs);
  }

  /** Sync one file and return its diagnostics after pull or push collection. */
  async syncAndWaitForDiagnostics(filePath: string, content: string): Promise<Diagnostic[]> {
    const uri = fileToUri(filePath);
    const syncStart = Date.now();
    this.didChange(filePath, content);

    if (this.host.supportsPullDiagnostics()) {
      const remaining = DIAGNOSTIC_WAIT_MS - (Date.now() - syncStart);
      if (remaining > 0) {
        try {
          const pulled = await this.#pullDiagnosticsForUri(uri, remaining);
          if (pulled) return this.getDiagnostics(filePath);
        } catch {
          // Pull diagnostics failed. Wait for push diagnostics instead.
        }
      }
    }

    await this.#waitForDiagnostics(uri, Math.max(0, DIAGNOSTIC_WAIT_MS - (Date.now() - syncStart)));
    return this.getDiagnostics(filePath);
  }

  #resyncOpenDocuments(): void {
    for (const [uri, doc] of this.#openDocs) {
      const filePath = uriToFile(uri);
      try {
        if (!existsSync(filePath)) {
          this.#clearFileState(uri);
          this.#sendDidClose(uri);
          continue;
        }
        const content = readFileSync(filePath, "utf-8");
        doc.version++;
        this.#sendDidChange(uri, doc.version, content);
      } catch {
        // Keep the document open when a transient read fails.
      }
    }
  }

  async #pullDiagnosticsForOpenDocuments(syncStart: number, maxWaitMs: number): Promise<void> {
    const deadline = syncStart + maxWaitMs;
    const uris = Array.from(this.#openDocs.keys());
    const results = await Promise.allSettled(
      uris.map(async (uri) => {
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw new Error("pull diagnostic timeout");
        return this.#pullDiagnosticsForUri(uri, remaining);
      }),
    );

    const anySuccess = results.some((result) => result.status === "fulfilled" && result.value);
    const hadFailure = results.some((result) => result.status === "rejected");
    if ((hadFailure || !anySuccess) && uris.length > 0) {
      throw new Error("pull diagnostics incomplete");
    }
  }

  async #pullDiagnosticsForUri(uri: string, timeoutMs: number): Promise<boolean> {
    const previousResultId = this.#diagnosticStore.get(uri)?.resultId;
    const report = await this.host.pullDocumentDiagnostics(uri, previousResultId, timeoutMs);
    if (!report) return false;
    this.#applyPullReport(uri, report);
    return true;
  }

  #applyPullReport(uri: string, report: DocumentDiagnosticReport): void {
    if (report.kind === "full") {
      this.#diagnosticStore.set(uri, {
        diagnostics: report.items,
        receivedAt: Date.now(),
        resultId: report.resultId,
      });
    } else {
      const current = this.#diagnosticStore.get(uri);
      if (current) current.resultId = report.resultId;
    }

    for (const [relatedUri, relatedReport] of Object.entries(report.relatedDocuments ?? {})) {
      if (relatedReport.kind !== "full") continue;
      this.#diagnosticStore.set(relatedUri, {
        diagnostics: relatedReport.items,
        receivedAt: Date.now(),
        resultId: relatedReport.resultId,
      });
    }
  }

  async #waitForDiagnosticSettle(
    syncStart: number,
    maxWaitMs: number,
    quietMs: number,
  ): Promise<void> {
    const deadline = syncStart + maxWaitMs;
    while (Date.now() < deadline) {
      const lastReceived = this.#lastDiagnosticReceivedAfter(syncStart) || syncStart;
      const elapsed = Date.now() - lastReceived;
      if (elapsed >= quietMs) return;
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(quietMs - elapsed, deadline - Date.now(), 50)),
      );
    }
  }

  #lastDiagnosticReceivedAfter(afterTime: number): number {
    let latest = 0;
    for (const entry of this.#diagnosticStore.values()) {
      if (entry.receivedAt > afterTime && entry.receivedAt > latest) latest = entry.receivedAt;
    }
    return latest;
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
    this.#releaseDiagnosticWaiters(uri);
  }

  #waitForDiagnostics(uri: string, timeoutMs: number): Promise<void> {
    if (timeoutMs <= 0) return Promise.resolve();

    return new Promise<void>((resolve) => {
      const waiter = () => {
        clearTimeout(timer);
        this.#removeDiagnosticWaiter(uri, waiter);
        resolve();
      };
      const timer = setTimeout(() => {
        this.#removeDiagnosticWaiter(uri, waiter);
        resolve();
      }, timeoutMs);
      const waiters = this.#diagnosticWaiters.get(uri) ?? [];
      waiters.push(waiter);
      this.#diagnosticWaiters.set(uri, waiters);
    });
  }

  #removeDiagnosticWaiter(uri: string, waiter: () => void): void {
    const waiters = this.#diagnosticWaiters.get(uri);
    if (!waiters) return;
    const next = waiters.filter((entry) => entry !== waiter);
    if (next.length > 0) this.#diagnosticWaiters.set(uri, next);
    else this.#diagnosticWaiters.delete(uri);
  }

  #releaseAllDiagnosticWaiters(): void {
    for (const uri of Array.from(this.#diagnosticWaiters.keys())) {
      this.#releaseDiagnosticWaiters(uri);
    }
  }

  #releaseDiagnosticWaiters(uri: string): void {
    const waiters = this.#diagnosticWaiters.get(uri);
    if (!waiters) return;
    this.#diagnosticWaiters.delete(uri);
    for (const waiter of waiters) waiter();
  }
}
