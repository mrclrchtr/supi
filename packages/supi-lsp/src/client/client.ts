// LSP Client — wraps a server process + JsonRpcClient.
// Handles initialize handshake, document sync, shutdown, and crash recovery.

// biome-ignore lint/style/noExcessiveLinesPerFile: process lifecycle, readiness, and protocol requests stay in one client wrapper; document and diagnostic state is delegated.
import { type ChildProcess, execSync, spawn } from "node:child_process";
import * as path from "node:path";
import {
  type CodeQueryResult,
  completedCodeQuery,
  unavailableCodeQuery,
} from "@mrclrchtr/supi-code-runtime/api";
import { recordDebugEvent } from "@mrclrchtr/supi-core/debug";
import type { ProgressToken } from "vscode-languageserver-protocol";
import { CLIENT_CAPABILITIES } from "../config/capabilities.ts";
import type {
  CodeAction,
  CodeActionContext,
  Diagnostic,
  DidChangeWatchedFilesParams,
  DocumentDiagnosticReport,
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
  WorkspaceEdit,
  WorkspaceSymbol,
} from "../config/types.ts";
import { fileToUri } from "../utils.ts";
import { ClientDiagnostics, type DiagnosticEntry } from "./client-diagnostics.ts";
import { JsonRpcClient, JsonRpcRequestError } from "./transport.ts";

const SHUTDOWN_TIMEOUT_MS = 5_000;

/** Race an operation against a timeout without retaining the timer after settlement. */
async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

// ── Process-tree cleanup ──────────────────────────────────────────────

/**
 * Kill a process and all its descendants.
 *
 * On Unix, sends SIGTERM to the process group (negative PID).
 * This requires the child to be spawned with `detached: true`.
 * On Windows, uses `taskkill /T /F` to force-kill the entire tree.
 */
function killProcessTree(pid: number): void {
  if (process.platform === "win32") {
    try {
      execSync(`taskkill /PID ${pid} /T /F`, { stdio: "ignore" });
    } catch {
      // Process may have already exited — ignore.
    }
    return;
  }
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    // Process group may already be dead — ignore.
  }
}

// ── Types ─────────────────────────────────────────────────────────────
export type ClientStatus = "initializing" | "running" | "error" | "shutdown";

// ── LspClient ─────────────────────────────────────────────────────────
export class LspClient {
  readonly name: string;
  readonly root: string;

  private process: ChildProcess | null = null;
  private rpc: JsonRpcClient | null = null;
  private _status: ClientStatus = "initializing";
  private capabilities: ServerCapabilities | null = null;
  private readonly diagnostics: ClientDiagnostics;

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
    this.diagnostics = new ClientDiagnostics({
      isOperational: () => this.rpc !== null && this._status === "running",
      supportsPullDiagnostics: () => this.hasDiagnosticProvider,
      sendNotification: (method, params) => {
        if (this.rpc) void this.rpc.sendNotification(method, params);
      },
      pullDocumentDiagnostics: async (uri, previousResultId, timeoutMs, signal) => {
        const rpc = this.rpc;
        if (!rpc || this._status !== "running") throw new Error("client not running");
        await this.getReady();
        return rpc.sendRequest(
          "textDocument/diagnostic",
          { textDocument: { uri }, previousResultId },
          { timeoutMs, signal },
        ) as Promise<DocumentDiagnosticReport>;
      },
    });
  }

  get status(): ClientStatus {
    return this._status;
  }

  get openFiles(): string[] {
    return this.diagnostics.openFiles;
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
        // Run the server in its own process group so we can atomically
        // kill the entire tree (server + subprocesses like tsserver)
        // with `process.kill(-pid, signal)` on Unix or `taskkill /T` on Windows.
        detached: true,
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
      this.handleProcessFailure(new Error("Client crashed"));
    });

    this.process.on("error", (_err) => {
      this.handleProcessFailure(new Error("Client process error"));
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

      const positionEncoding = result.capabilities.positionEncoding ?? "utf-16";
      if (positionEncoding !== "utf-16") {
        throw new Error(`Server selected unsupported position encoding "${positionEncoding}".`);
      }
      this.capabilities = result.capabilities;
      void this.rpc.sendNotification("initialized", {});
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
    this.diagnostics.clear();

    if (!this.rpc || !this.process) return;

    try {
      await withTimeout(this.rpc.sendRequest("shutdown"), SHUTDOWN_TIMEOUT_MS, "shutdown timeout");
      // Flush the final exit notification before disposing the transport.
      await withTimeout(
        this.rpc.sendNotification("exit"),
        SHUTDOWN_TIMEOUT_MS,
        "exit notification timeout",
      );
    } catch {
      // Timeout or error — force kill
    }

    this.rpc.dispose();

    // Kill the entire process tree (server + subprocesses like tsserver).
    // The LSP shutdown/exit protocol above should trigger a graceful exit,
    // but the process-group kill ensures no orphans survive.
    const pid = this.process.pid;
    if (this.process.exitCode === null && pid) {
      killProcessTree(pid);
      if (process.platform !== "win32") {
        // Escalate to SIGKILL after a brief grace period on Unix.
        // Windows taskkill /F is already forceful.
        await new Promise<void>((resolve) => {
          setTimeout(() => {
            try {
              process.kill(-pid, "SIGKILL");
            } catch {
              // Already dead — ignore.
            }
            resolve();
          }, 500);
        });
      }
    }

    // Clear readiness state
    if (this.noProgressTimer) {
      clearTimeout(this.noProgressTimer);
      this.noProgressTimer = null;
    }
    for (const timer of this.tokenTimeouts.values()) clearTimeout(timer);
    this.tokenTimeouts.clear();
    this.rejectReady(new Error("Client shutdown"));
  }

  private handleProcessFailure(reason: Error): void {
    if (this._status !== "shutdown") {
      this._status = "error";
      this.cancelNoProgressTimer();
      this.rejectReady(reason);
    }
    this.diagnostics.clear();
    this.rpc?.dispose();
  }

  // ── Document Synchronization and Diagnostics ────────────────────────
  /** Open a document, or update it when it is already open. */
  didOpen(filePath: string, content: string): void {
    this.diagnostics.didOpen(filePath, content);
  }

  /** Update a document, or open it when it is not tracked yet. */
  didChange(filePath: string, content: string): void {
    this.diagnostics.didChange(filePath, content);
  }

  /** Close a document and remove its cached diagnostic state. */
  didClose(filePath: string): void {
    this.diagnostics.didClose(filePath);
  }

  /** Remove missing document and diagnostic state, and return the removed paths. */
  pruneMissingFiles(): string[] {
    return this.diagnostics.pruneMissingFiles();
  }

  /** Return the current client version, or null when the document is not open. */
  getOpenDocumentVersion(filePath: string): number | null {
    return this.diagnostics.getOpenDocumentVersion(filePath);
  }

  /** Return stored diagnostics for one file. */
  getDiagnostics(filePath: string): Diagnostic[] {
    return this.diagnostics.getDiagnostics(filePath);
  }

  /** Return non-empty diagnostics for files that still exist. */
  getAllDiagnostics(): DiagnosticEntry[] {
    return this.diagnostics.getAllDiagnostics();
  }

  /** Force the next pull refresh to request complete diagnostic reports. */
  clearPullResultIds(): void {
    this.diagnostics.clearPullResultIds();
  }

  /** Check if server supports pull diagnostics. */
  get hasDiagnosticProvider(): boolean {
    return this.capabilities?.diagnosticProvider !== undefined;
  }

  /** Notify the server that watched workspace files changed. */
  notifyWorkspaceFileChanges(changes: FileEvent[]): void {
    if (!this.rpc || this._status !== "running" || changes.length === 0) return;
    void this.rpc.sendNotification("workspace/didChangeWatchedFiles", {
      changes,
    } satisfies DidChangeWatchedFilesParams);
  }

  /** Re-read open documents, then collect pull diagnostics or wait for push diagnostics. */
  async refreshOpenDiagnostics(
    options: { maxWaitMs?: number; quietMs?: number } = {},
  ): Promise<void> {
    return this.diagnostics.refreshOpenDiagnostics(options);
  }

  /** Sync one file and return diagnostics with explicit evidence availability. */
  async syncAndWaitForDiagnostics(
    filePath: string,
    content: string,
  ): Promise<CodeQueryResult<Diagnostic[]>> {
    return this.diagnostics.syncAndWaitForDiagnostics(filePath, content);
  }

  // ── LSP Requests ───────────────────────────────────────────────────
  async hover(filePath: string, position: Position): Promise<CodeQueryResult<Hover | null>> {
    return this.query("textDocument/hover", {
      textDocument: { uri: fileToUri(filePath) },
      position,
    });
  }

  async definition(
    filePath: string,
    position: Position,
  ): Promise<CodeQueryResult<Location | Location[] | LocationLink[] | null>> {
    return this.query("textDocument/definition", {
      textDocument: { uri: fileToUri(filePath) },
      position,
    });
  }

  async references(
    filePath: string,
    position: Position,
  ): Promise<CodeQueryResult<Location[] | null>> {
    return this.query("textDocument/references", {
      textDocument: { uri: fileToUri(filePath) },
      position,
      context: { includeDeclaration: true },
    });
  }

  async documentSymbols(
    filePath: string,
  ): Promise<CodeQueryResult<DocumentSymbol[] | SymbolInformation[] | null>> {
    return this.query("textDocument/documentSymbol", {
      textDocument: { uri: fileToUri(filePath) },
    });
  }

  async workspaceSymbol(
    query: string,
  ): Promise<CodeQueryResult<SymbolInformation[] | WorkspaceSymbol[] | null>> {
    if (!this.capabilities?.workspaceSymbolProvider) {
      return unavailableCodeQuery("Workspace-symbol requests are not supported by this server.");
    }
    return this.query("workspace/symbol", { query });
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
  ): Promise<CodeQueryResult<Location | Location[] | LocationLink[] | null>> {
    if (!this.capabilities?.implementationProvider) {
      return unavailableCodeQuery("Implementation requests are not supported by this server.");
    }
    return this.query("textDocument/implementation", {
      textDocument: { uri: fileToUri(filePath) },
      position,
    });
  }

  // ── Private ─────────────────────────────────────────────────────────
  private async query<T>(method: string, params: unknown): Promise<CodeQueryResult<T | null>> {
    if (!this.rpc || this._status !== "running") {
      return unavailableCodeQuery(
        `LSP request ${method} is unavailable because the client is not running.`,
      );
    }
    try {
      await this.getReady();
      const data = (await this.rpc.sendRequest(method, params)) as T | null | undefined;
      return completedCodeQuery(data ?? null);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return unavailableCodeQuery(`LSP request ${method} failed: ${detail}`);
    }
  }

  private async request<T>(method: string, params: unknown): Promise<T | null> {
    const result = await this.query<T>(method, params);
    return result.kind === "unavailable" ? null : result.data;
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

  /** Apply a diagnostic publication received from the LSP transport. */
  handlePublishDiagnostics(params: PublishDiagnosticsParams): void {
    this.diagnostics.handlePublishDiagnostics(params);
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
