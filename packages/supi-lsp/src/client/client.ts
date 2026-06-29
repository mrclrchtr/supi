// LSP Client — wraps a server process + JsonRpcClient.
// Handles initialize handshake, document sync, shutdown, and crash recovery.

// biome-ignore lint/style/noExcessiveLinesPerFile: LspClient remains a cohesive stateful wrapper; refresh logic is already split out.
import { type ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import * as path from "node:path";
import { recordDebugEvent } from "@mrclrchtr/supi-core/debug";
import type { ProgressToken } from "vscode-languageserver-protocol";
import { CLIENT_CAPABILITIES } from "../config/capabilities.ts";
import type {
  CodeAction,
  CodeActionContext,
  Diagnostic,
  DidChangeWatchedFilesParams,
  DocumentSymbol,
  FileEvent,
  Hover,
  InitializeResult,
  Location,
  LocationLink,
  Position,
  PublishDiagnosticsParams,
  Range,
  ServerCapabilities,
  ServerConfig,
  SymbolInformation,
  TextDocumentIdentifier,
  TextDocumentItem,
  VersionedTextDocumentIdentifier,
  WorkspaceEdit,
  WorkspaceSymbol,
} from "../config/types.ts";
import { detectLanguageId, fileToUri, uriToFile } from "../utils.ts";
import { JsonRpcClient, JsonRpcRequestError } from "./transport.ts";

const SHUTDOWN_TIMEOUT_MS = 5_000;
const DIAGNOSTIC_WAIT_MS = 3_000;

// ── Types ─────────────────────────────────────────────────────────────
export type ClientStatus = "initializing" | "running" | "error" | "shutdown";

export interface DiagnosticEntry {
  uri: string;
  diagnostics: Diagnostic[];
}

/** Internal metadata tracked alongside cached diagnostics. */
export interface DiagnosticCacheEntry {
  diagnostics: Diagnostic[];
  receivedAt: number;
  version?: number;
  resultId?: string;
}

// ── LspClient ─────────────────────────────────────────────────────────
export class LspClient {
  readonly name: string;
  readonly root: string;

  private process: ChildProcess | null = null;
  private rpc: JsonRpcClient | null = null;
  private _status: ClientStatus = "initializing";
  private capabilities: ServerCapabilities | null = null;

  /** Open documents: uri → { version, languageId } */
  private openDocs = new Map<string, { version: number; languageId: string }>();
  /** Per-file diagnostics with freshness metadata */
  private diagnosticStore = new Map<string, DiagnosticCacheEntry>();
  /** Listeners waiting for diagnostics on a specific uri */
  private diagnosticWaiters = new Map<string, Array<() => void>>();

  // ── Readiness (work-done-progress) ──────────────────────────────────
  private trackedTokens = new Map<ProgressToken, "begin-seen" | "ended">();
  private _readyPromise: Promise<void> | null = null;
  private _readyResolve: (() => void) | undefined;
  private _readyReject: ((err: Error) => void) | undefined;
  private _isReady = false;
  private noProgressTimer: ReturnType<typeof setTimeout> | null = null;
  private tokenTimeouts = new Map<ProgressToken, ReturnType<typeof setTimeout>>();

  constructor(
    name: string,
    private readonly config: ServerConfig,
    root: string,
  ) {
    this.name = name;
    this.root = root;
  }

  get status(): ClientStatus {
    return this._status;
  }

  get openFiles(): string[] {
    return Array.from(this.openDocs.keys()).map(uriToFile);
  }

  get serverCapabilities(): ServerCapabilities | null {
    return this.capabilities;
  }

  /** Whether the server is currently not indexing and ready to serve queries. */
  get ready(): boolean {
    return this._isReady;
  }

  // ── Lifecycle ───────────────────────────────────────────────────────
  /** Spawn the server process and perform the initialize handshake. */
  async start(): Promise<void> {
    const cmd = this.config.command;
    const args = this.config.args ?? [];

    try {
      this.process = spawn(cmd, args, {
        cwd: this.root,
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env },
      });
    } catch (err) {
      this._status = "error";
      throw new Error(`Failed to spawn ${cmd}: ${err}`, { cause: err });
    }

    if (!this.process.stdin || !this.process.stdout) {
      this._status = "error";
      this.process.kill();
      throw new Error(`${cmd}: missing stdin/stdout`);
    }

    this.rpc = new JsonRpcClient(this.process.stdout, this.process.stdin);

    // Handle notifications
    this.rpc.onNotification((method, params) => {
      if (method === "textDocument/publishDiagnostics") {
        this.handlePublishDiagnostics(params as PublishDiagnosticsParams);
      } else if (method === "$/progress") {
        this.handleProgress(params as { token: ProgressToken; value: { kind: string } });
      }
    });
    this.rpc.onRequest((method, params) => this.handleServerRequest(method, params));

    // Handle crashes
    this.process.on("exit", (_code) => {
      if (this._status !== "shutdown") {
        this._status = "error";
        this.cancelNoProgressTimer();
        this.rejectReady(new Error("Client crashed"));
      }
      this.rpc?.dispose();
    });

    this.process.on("error", (_err) => {
      if (this._status !== "shutdown") {
        this._status = "error";
        this.rejectReady(new Error("Client process error"));
      }
    });

    // Suppress stderr to avoid noise in the agent
    this.process.stderr?.on("data", () => {});

    // Initialize handshake
    try {
      const result = (await this.rpc.sendRequest("initialize", {
        processId: process.pid,
        rootUri: fileToUri(this.root),
        capabilities: CLIENT_CAPABILITIES,
        initializationOptions: this.config.initializationOptions,
      })) as InitializeResult;

      this.capabilities = result.capabilities;
      this.rpc.sendNotification("initialized", {});
      this._status = "running";

      this.armNoProgressTimer();
    } catch (err) {
      this._status = "error";
      this.process.kill();
      throw new Error(`${this.name}: initialize failed: ${err}`, { cause: err });
    }
  }

  /** Graceful shutdown: send shutdown → exit, kill after timeout. */
  async shutdown(): Promise<void> {
    if (this._status === "shutdown") return;
    this._status = "shutdown";

    if (!this.rpc || !this.process) return;

    try {
      // Send shutdown request with a timeout
      await Promise.race([
        this.rpc.sendRequest("shutdown"),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("shutdown timeout")), SHUTDOWN_TIMEOUT_MS),
        ),
      ]);
      // Flush the final exit notification before disposing the transport.
      await Promise.race([
        this.rpc.sendNotification("exit"),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("exit notification timeout")), SHUTDOWN_TIMEOUT_MS),
        ),
      ]);
    } catch {
      // Timeout or error — force kill
    }

    this.rpc.dispose();

    // Wait briefly for clean exit, then force kill
    if (this.process.exitCode === null) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          this.process?.kill("SIGTERM");
          resolve();
        }, 1_000);
        this.process?.on("exit", () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }

    this.openDocs.clear();
    this.diagnosticStore.clear();
    this.releaseAllDiagnosticWaiters();

    // Clear readiness state
    if (this.noProgressTimer) {
      clearTimeout(this.noProgressTimer);
      this.noProgressTimer = null;
    }
    for (const timer of this.tokenTimeouts.values()) clearTimeout(timer);
    this.tokenTimeouts.clear();
    this.rejectReady(new Error("Client shutdown"));
  }

  // ── Document Synchronization ────────────────────────────────────────
  /** Open a document (or re-sync if already open). */
  didOpen(filePath: string, content: string): void {
    if (!this.rpc || this._status !== "running") return;

    const uri = fileToUri(filePath);
    const languageId = detectLanguageId(filePath);

    if (this.openDocs.has(uri)) {
      // Already open — send didChange instead
      this.didChange(filePath, content);
      return;
    }

    this.openDocs.set(uri, { version: 1, languageId });
    this.rpc.sendNotification("textDocument/didOpen", {
      textDocument: {
        uri,
        languageId,
        version: 1,
        text: content,
      } satisfies TextDocumentItem,
    });
  }

  /** Notify the server of a content change (full document sync). */
  didChange(filePath: string, content: string): void {
    if (!this.rpc || this._status !== "running") return;

    const uri = fileToUri(filePath);
    const doc = this.openDocs.get(uri);

    if (!doc) {
      // Not yet open — do a didOpen
      this.didOpen(filePath, content);
      return;
    }

    doc.version++;
    this.rpc.sendNotification("textDocument/didChange", {
      textDocument: { uri, version: doc.version } satisfies VersionedTextDocumentIdentifier,
      contentChanges: [{ text: content }],
    });
  }

  /** Close a document and clear any cached state for it. */
  didClose(filePath: string): void {
    const uri = fileToUri(filePath);
    const wasOpen = this.openDocs.has(uri);

    this.clearFileState(uri);

    if (!wasOpen || !this.rpc || this._status !== "running") return;

    this.rpc.sendNotification("textDocument/didClose", {
      textDocument: { uri } satisfies TextDocumentIdentifier,
    });
  }

  /** Prune missing files from open documents and cached diagnostics. */
  pruneMissingFiles(): string[] {
    const uris = new Set([...this.openDocs.keys(), ...this.diagnosticStore.keys()]);
    const removedFiles: string[] = [];

    for (const uri of uris) {
      const filePath = uriToFile(uri);
      if (existsSync(filePath)) continue;

      const wasOpen = this.openDocs.has(uri);
      this.clearFileState(uri);
      removedFiles.push(filePath);

      if (wasOpen && this.rpc && this._status === "running") {
        this.rpc.sendNotification("textDocument/didClose", {
          textDocument: { uri } satisfies TextDocumentIdentifier,
        });
      }
    }

    return removedFiles;
  }

  // ── Diagnostics ─────────────────────────────────────────────────────
  /** Get stored diagnostics for a file. */
  getDiagnostics(filePath: string): Diagnostic[] {
    return this.diagnosticStore.get(fileToUri(filePath))?.diagnostics ?? [];
  }

  /**
   * Get all stored diagnostics across all files.
   *
   * Filters out empty entries and — defensively — files that no longer exist
   * on disk. The latter guards against a race where a `publishDiagnostics`
   * notification (already in-flight) arrives *after* `pruneMissingFiles()`
   * has removed the file from `openDocs`, recreating a stale cache entry.
   */
  getAllDiagnostics(): DiagnosticEntry[] {
    const result: DiagnosticEntry[] = [];
    for (const [uri, entry] of this.diagnosticStore) {
      if (entry.diagnostics.length === 0) continue;
      // Defensive: drop diagnostics for files deleted after prune. Late
      // in-flight publishDiagnostics notifications can recreate stale entries.
      if (!existsSync(uriToFile(uri))) continue;
      result.push({ uri, diagnostics: entry.diagnostics });
    }
    return result;
  }

  /** Get the internal cache entry for a file (exposed for testing / version checks). */
  getDiagnosticCacheEntry(uri: string): DiagnosticCacheEntry | undefined {
    return this.diagnosticStore.get(uri);
  }

  /**
   * Clear all pull-diagnostic result IDs, forcing full (not `unchanged`)
   * pull diagnostic responses on the next refresh cycle.
   *
   * Use this after file creation/write operations so that cross-file
   * diagnostics (e.g., `Cannot find module` errors in importing files)
   * are fully re-computed instead of returned as `unchanged`.
   */
  clearPullResultIds(): void {
    for (const entry of this.diagnosticStore.values()) {
      delete entry.resultId;
    }
  }

  /** Get all currently open document URIs. */
  get openUris(): string[] {
    return Array.from(this.openDocs.keys());
  }

  /** Check if server supports pull diagnostics. */
  get hasDiagnosticProvider(): boolean {
    return this.capabilities?.diagnosticProvider !== undefined;
  }

  /** Notify the server that watched workspace files changed. */
  notifyWorkspaceFileChanges(changes: FileEvent[]): void {
    if (!this.rpc || this._status !== "running" || changes.length === 0) return;
    this.rpc.sendNotification("workspace/didChangeWatchedFiles", {
      changes,
    } satisfies DidChangeWatchedFilesParams);
  }

  /**
   * Re-read and re-sync all currently open, existing documents.
   * Delegates to client-refresh module.
   */
  async refreshOpenDiagnostics(
    options: { maxWaitMs?: number; quietMs?: number } = {},
  ): Promise<void> {
    const { refreshClientOpenDiagnostics } = await import("./client-refresh.ts");
    return refreshClientOpenDiagnostics(this, options);
  }

  /**
   * Sync a file and wait for diagnostics (up to timeout).
   * Returns diagnostics for the file.
   */
  async syncAndWaitForDiagnostics(filePath: string, content: string): Promise<Diagnostic[]> {
    const uri = fileToUri(filePath);
    const syncStart = Date.now();

    // Sync the content
    this.didChange(filePath, content);

    // Prefer pull diagnostics when available, but fall back to push notifications.
    if (this.hasDiagnosticProvider) {
      const remaining = DIAGNOSTIC_WAIT_MS - (Date.now() - syncStart);
      if (remaining > 0) {
        try {
          const { pullDiagnosticsForUri } = await import("./client-refresh.ts");
          const pulled = await pullDiagnosticsForUri(this, uri, remaining);
          if (pulled) {
            return this.getDiagnostics(filePath);
          }
        } catch {
          // Pull diagnostics failed — fall back to push wait
        }
      }
    }

    await this.waitForDiagnostics(uri, Math.max(0, DIAGNOSTIC_WAIT_MS - (Date.now() - syncStart)));
    return this.getDiagnostics(filePath);
  }

  // ── LSP Requests ───────────────────────────────────────────────────
  async hover(filePath: string, position: Position): Promise<Hover | null> {
    return this.request("textDocument/hover", {
      textDocument: { uri: fileToUri(filePath) },
      position,
    });
  }

  async definition(
    filePath: string,
    position: Position,
  ): Promise<Location | Location[] | LocationLink[] | null> {
    return this.request("textDocument/definition", {
      textDocument: { uri: fileToUri(filePath) },
      position,
    });
  }

  async references(filePath: string, position: Position): Promise<Location[] | null> {
    return this.request("textDocument/references", {
      textDocument: { uri: fileToUri(filePath) },
      position,
      context: { includeDeclaration: true },
    });
  }

  async documentSymbols(filePath: string): Promise<DocumentSymbol[] | SymbolInformation[] | null> {
    return this.request("textDocument/documentSymbol", {
      textDocument: { uri: fileToUri(filePath) },
    });
  }

  async workspaceSymbol(query: string): Promise<SymbolInformation[] | WorkspaceSymbol[] | null> {
    if (!this.capabilities?.workspaceSymbolProvider) return null;
    return this.request("workspace/symbol", { query });
  }

  async rename(
    filePath: string,
    position: Position,
    newName: string,
  ): Promise<WorkspaceEdit | null> {
    return this.request("textDocument/rename", {
      textDocument: { uri: fileToUri(filePath) },
      position,
      newName,
    });
  }

  async codeActions(
    filePath: string,
    range: Range,
    context: CodeActionContext,
  ): Promise<CodeAction[] | null> {
    return this.request("textDocument/codeAction", {
      textDocument: { uri: fileToUri(filePath) },
      range,
      context,
    });
  }

  async implementation(
    filePath: string,
    position: Position,
  ): Promise<Location | Location[] | LocationLink[] | null> {
    if (!this.capabilities?.implementationProvider) return null;
    return this.request("textDocument/implementation", {
      textDocument: { uri: fileToUri(filePath) },
      position,
    });
  }

  // ── Private ─────────────────────────────────────────────────────────
  private async request<T>(method: string, params: unknown): Promise<T | null> {
    if (!this.rpc || this._status !== "running") return null;
    try {
      await this.getReady();
      return (await this.rpc.sendRequest(method, params)) as T;
    } catch {
      return null;
    }
  }

  private handleServerRequest(method: string, params: unknown): unknown {
    switch (method) {
      case "workspace/configuration":
        return this.buildWorkspaceConfigurationResult(params);
      case "workspace/workspaceFolders":
        return [{ uri: fileToUri(this.root), name: path.basename(this.root) || this.root }];
      case "client/registerCapability":
      case "client/unregisterCapability":
        return null;
      case "window/workDoneProgress/create": {
        const token = (params as { token: ProgressToken }).token;
        this.trackedTokens.set(token, "begin-seen");
        this.cancelNoProgressTimer();
        this._isReady = false;
        if (!this._readyPromise) {
          this._readyPromise = new Promise<void>((resolve, reject) => {
            this._readyResolve = resolve;
            this._readyReject = reject;
          });
          // Prevent unhandled rejection when rejectReady fires before any
          // consumer is actively awaiting this promise (e.g. during shutdown).
          this._readyPromise.catch(() => {});
        }
        this.startTokenTimeout(token);
        return null;
      }
      default:
        throw new JsonRpcRequestError(-32601, `Method not found: ${method}`);
    }
  }

  private buildWorkspaceConfigurationResult(params: unknown): unknown[] {
    if (!params || typeof params !== "object") return [];
    const items = (params as { items?: unknown }).items;
    if (!Array.isArray(items)) return [];
    return items.map(() => null);
  }

  private handlePublishDiagnostics(params: PublishDiagnosticsParams): void {
    // If the publication includes a version and we have a newer synced
    // version for this open document, ignore the stale publication.
    if (params.version !== undefined && params.version !== null) {
      const openDoc = this.openDocs.get(params.uri);
      if (openDoc && params.version < openDoc.version) {
        return;
      }
    }

    this.diagnosticStore.set(params.uri, {
      diagnostics: params.diagnostics,
      receivedAt: Date.now(),
      version: params.version ?? undefined,
    });
    this.releaseDiagnosticWaiters(params.uri);
  }

  /** Wait for diagnostics on a URI, resolving on publication or timeout. */
  private waitForDiagnostics(uri: string, timeoutMs: number): Promise<void> {
    if (timeoutMs <= 0) return Promise.resolve();

    return new Promise<void>((resolve) => {
      const waiter = () => {
        clearTimeout(timer);
        this.removeDiagnosticWaiter(uri, waiter);
        resolve();
      };
      const timer = setTimeout(() => {
        this.removeDiagnosticWaiter(uri, waiter);
        resolve();
      }, timeoutMs);
      const waiters = this.diagnosticWaiters.get(uri) ?? [];
      waiters.push(waiter);
      this.diagnosticWaiters.set(uri, waiters);
    });
  }

  /** Clear all per-file state and wake any diagnostics callers waiting on this URI. */
  private clearFileState(uri: string): void {
    this.openDocs.delete(uri);
    this.diagnosticStore.delete(uri);
    this.releaseDiagnosticWaiters(uri);
  }

  /** Remove a single pending diagnostics waiter, usually after its timeout fires. */
  private removeDiagnosticWaiter(uri: string, waiter: () => void): void {
    const waiters = this.diagnosticWaiters.get(uri);
    if (!waiters) return;

    const next = waiters.filter((entry) => entry !== waiter);
    if (next.length > 0) {
      this.diagnosticWaiters.set(uri, next);
    } else {
      this.diagnosticWaiters.delete(uri);
    }
  }

  /** Wake every pending diagnostics waiter during shutdown or bulk cleanup. */
  private releaseAllDiagnosticWaiters(): void {
    for (const uri of Array.from(this.diagnosticWaiters.keys())) {
      this.releaseDiagnosticWaiters(uri);
    }
  }

  /** Wake all diagnostics waiters for a URI and remove them from the waiter map. */
  private releaseDiagnosticWaiters(uri: string): void {
    const waiters = this.diagnosticWaiters.get(uri);
    if (!waiters) return;

    this.diagnosticWaiters.delete(uri);
    for (const waiter of waiters) waiter();
  }

  // ── Readiness (work-done-progress) ──────────────────────────────────

  /**
   * Wait for the server to be ready to serve queries.
   * Returns immediately if already ready; returns the ongoing promise
   * if one is pending; creates and returns a new one otherwise.
   */
  async getReady(): Promise<void> {
    if (this._isReady) return;
    if (this._readyPromise !== null) return this._readyPromise;
    // If no progress timer was ever armed and no tokens are tracked,
    // the server was either never started with a real process (test scenario)
    // or completed before any progress tracking began. Resolve immediately
    // only when the client is still running — a crash or shutdown clears
    // both fields but must not report the client as ready.
    if (this.noProgressTimer === null && this.trackedTokens.size === 0) {
      if (this._status === "running") this._isReady = true;
      return;
    }
    this._readyPromise = new Promise<void>((resolve, reject) => {
      this._readyResolve = resolve;
      this._readyReject = reject;
    });
    // Prevent unhandled rejection when rejectReady fires before any
    // consumer is actively awaiting this promise (e.g. during shutdown).
    this._readyPromise.catch(() => {});
    return this._readyPromise;
  }

  /** Handle the $/progress notification from the server. */
  private handleProgress(params: { token: ProgressToken; value: { kind: string } }): void {
    const { token, value } = params;
    // Defensive: guard against malformed notifications without a value.
    if (!value || typeof value.kind !== "string") return;

    if (value.kind === "begin") {
      recordDebugEvent({
        source: "lsp",
        level: "debug",
        category: "readiness.progress-begin",
        message: `Readiness progress begin for token ${token}`,
        data: { token },
      });
      // Cancel the 2s no-progress grace timer — a server that sends
      // begin without a prior create is spec-deviant but valid.
      this.cancelNoProgressTimer();
      this.trackedTokens.set(token, "begin-seen");
      this._isReady = false;
      // Re-arm readiness promise if not already pending
      if (!this._readyPromise) {
        this._readyPromise = new Promise<void>((resolve, reject) => {
          this._readyResolve = resolve;
          this._readyReject = reject;
        });
        // Prevent unhandled rejection when rejectReady fires before any
        // consumer is actively awaiting this promise (e.g. during shutdown).
        this._readyPromise.catch(() => {});
      }
      this.startTokenTimeout(token);
    } else if (value.kind === "end") {
      recordDebugEvent({
        source: "lsp",
        level: "debug",
        category: "readiness.progress-end",
        message: `Readiness progress end for token ${token}`,
        data: { token },
      });
      this.trackedTokens.set(token, "ended");
      this.clearTokenTimeout(token);
      this.checkAllTokensEnded();
    }
    // kind: "report" — intentionally no-op
  }

  /** Check whether all tracked tokens have ended and resolve readiness. */
  private checkAllTokensEnded(): void {
    if (this.trackedTokens.size === 0) return;
    for (const state of this.trackedTokens.values()) {
      if (state !== "ended") return;
    }
    this.trackedTokens.clear();
    this.resolveReady();
  }

  /** Resolve the current readiness promise (if any) and mark the client ready. */
  private resolveReady(): void {
    if (this._readyResolve) {
      this._readyResolve();
      this._readyPromise = null;
      this._readyResolve = undefined;
      this._readyReject = undefined;
    }
    this._isReady = true;
    recordDebugEvent({
      source: "lsp",
      level: "info",
      category: "readiness.resolved",
      message: `LSP client ${this.name} is ready (cwd: ${this.root})`,
    });
  }

  /**
   * Reject the current readiness promise (if any) and mark the client
   * not ready. Called on shutdown, crash, or restart.
   */
  private rejectReady(reason: Error): void {
    if (this._readyReject) {
      this._readyReject(reason);
      this._readyPromise = null;
      this._readyResolve = undefined;
      this._readyReject = undefined;
    }
    this._isReady = false;
    this.trackedTokens.clear();
    for (const timer of this.tokenTimeouts.values()) clearTimeout(timer);
    this.tokenTimeouts.clear();
    recordDebugEvent({
      source: "lsp",
      level: this._status === "shutdown" ? "debug" : "warning",
      category: "readiness.rejected",
      message: `LSP client ${this.name} readiness rejected: ${reason.message}`,
      data: { status: this._status },
    });
  }

  /**
   * Start a per-token timeout. If the token never receives an "end",
   * force-end it after `readinessTimeoutMs` (default 10s).
   */
  private startTokenTimeout(token: ProgressToken): void {
    // Clear any existing timeout for this token (e.g., if both
    // window/workDoneProgress/create and $/progress begin fire).
    this.clearTokenTimeout(token);
    const timeoutMs = this.config.readinessTimeoutMs ?? 10_000;
    const timer = setTimeout(() => {
      this.trackedTokens.set(token, "ended");
      this.tokenTimeouts.delete(token);
      recordDebugEvent({
        source: "lsp",
        level: "debug",
        category: "readiness.token-timeout",
        message: `Readiness per-token timeout fired for token ${token} after ${timeoutMs}ms`,
        data: { token, timeoutMs },
      });
      this.checkAllTokensEnded();
    }, timeoutMs);
    this.tokenTimeouts.set(token, timer);
  }

  /** Clear the per-token timeout for a completed token. */
  private clearTokenTimeout(token: ProgressToken): void {
    const timer = this.tokenTimeouts.get(token);
    if (timer) {
      clearTimeout(timer);
      this.tokenTimeouts.delete(token);
    }
  }

  /** Cancel the 2s no-progress grace timer. */
  private cancelNoProgressTimer(): void {
    if (this.noProgressTimer) {
      clearTimeout(this.noProgressTimer);
      this.noProgressTimer = null;
      recordDebugEvent({
        source: "lsp",
        level: "debug",
        category: "readiness.no-progress-cancelled",
        message: `No-progress grace timer cancelled for ${this.name}`,
      });
    }
  }

  /**
   * Arm the 2s no-progress grace timer. If no server-initiated
   * progress token arrives within this window, the server is treated
   * as immediately ready (small project or non-progress-supporting server).
   *
   * A server that sends its first $/progress begin after 2s causes
   * a brief false-ready window — the steady-state re-entrancy in
   * handleProgress() flips isReady back to false when the begin arrives.
   */
  private armNoProgressTimer(): void {
    this.noProgressTimer = setTimeout(() => {
      if (this.trackedTokens.size === 0 && this._status === "running") {
        recordDebugEvent({
          source: "lsp",
          level: "debug",
          category: "readiness.no-progress-resolved",
          message: `No-progress grace timer resolved for ${this.name}`,
        });
        this.resolveReady();
      }
      this.noProgressTimer = null;
    }, 2_000);
  }
}
