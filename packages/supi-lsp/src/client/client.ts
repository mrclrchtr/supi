// LSP Client — wraps a server process + JsonRpcClient.
// Handles initialize handshake, document sync, shutdown, and crash recovery.

// biome-ignore lint/style/noExcessiveLinesPerFile: process lifecycle, readiness, and protocol requests stay in one client wrapper; document and diagnostic state is delegated.
import { type ChildProcess, execSync, spawn } from "node:child_process";
import * as path from "node:path";
import {
  type CodeQueryResult,
  type CodeRequestControl,
  completedCodeQuery,
  isCodeRequestInterruption,
  throwIfCodeRequestInterrupted,
  unavailableCodeQuery,
} from "@mrclrchtr/supi-code-runtime/api";
import { recordDebugEvent } from "@mrclrchtr/supi-core/debug";
import { type ProgressToken, TextDocumentSyncKind } from "vscode-languageserver-protocol";
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
  Range,
  ServerCapabilities,
  ServerConfig,
  SymbolInformation,
  WorkspaceEdit,
  WorkspaceSymbol,
} from "../config/types.ts";
import { boundCwd, truncateIdentity } from "../debug-telemetry.ts";
import type { DiagnosticEvidenceSummary } from "../diagnostics/evidence.ts";
import { raceRequestControl } from "../session/readiness.ts";
import { fileToUri } from "../utils.ts";
import {
  ClientDynamicRegistrations,
  DOCUMENT_DIAGNOSTIC_METHOD,
  isValidDiagnosticOptions,
} from "./client-diagnostic-capabilities.ts";
import { ClientDiagnostics } from "./client-diagnostics.ts";
import type { ClientDiagnosticSnapshot, DiagnosticEntry } from "./client-document-state.ts";
import { JsonRpcClient, JsonRpcRequestError } from "./transport.ts";

const SHUTDOWN_TIMEOUT_MS = 5_000;

/**
 * Fixed bound after which a running client that never became ready is
 * considered readiness-stalled and eligible for a recovery restart.
 */
export const RECOVERY_CLIENT_STARTUP_BOUND_MS = 5_000;

/** Repeated protocol-stall failures that justify a recovery restart. */
export const RECOVERY_PROTOCOL_FAILURE_THRESHOLD = 3;

/** Stall signals that justify replacing a client's server process. */
export type RecoveryRestartReason = "readiness-stall" | "protocol-errors";

/** Race an operation against a timeout without retaining the timer after settlement. */
export async function withTimeout<T>(
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Read and validate the `registrations` array of a `client/registerCapability`
 * request. Each entry must be a record with string `id` and `method`; the
 * optional `registerOptions` stay unvalidated here (method-specific checks
 * happen in the handler). Malformed values reject the request.
 */
function readRegistrations(
  params: unknown,
  requestName: string,
): Array<{ id: string; method: string; registerOptions?: unknown }> {
  if (!isRecord(params) || !Array.isArray(params.registrations)) {
    throw new JsonRpcRequestError(-32602, `Malformed ${requestName} params.`);
  }
  const registrations: Array<{ id: string; method: string; registerOptions?: unknown }> = [];
  for (const registration of params.registrations) {
    if (
      !isRecord(registration) ||
      typeof registration.id !== "string" ||
      typeof registration.method !== "string"
    ) {
      throw new JsonRpcRequestError(-32602, `Malformed ${requestName} registration.`);
    }
    registrations.push({
      id: registration.id,
      method: registration.method,
      registerOptions: registration.registerOptions,
    });
  }
  return registrations;
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

/** Package-internal facts that the manager projects into workspace lifecycle transitions. */
export type LspClientLifecycleTransitionKind =
  | "startup"
  | "readiness"
  | "crash"
  | "shutdown"
  | "tracked-files";

/** Observer for one concrete client's lifecycle facts. */
export type LspClientLifecycleListener = (kind: LspClientLifecycleTransitionKind) => void;

// ── LspClient ─────────────────────────────────────────────────────────
export class LspClient {
  readonly name: string;
  readonly root: string;

  private process: ChildProcess | null = null;
  private rpc: JsonRpcClient | null = null;
  private _status: ClientStatus = "initializing";
  private capabilities: ServerCapabilities | null = null;
  private readonly diagnostics: ClientDiagnostics;
  /** Dynamic capability registrations for this client instance only. */
  private readonly dynamicRegistrations = new ClientDynamicRegistrations();

  // ── Readiness (work-done-progress) ──────────────────────────────────
  private trackedTokens = new Map<ProgressToken, "created" | "active" | "ended">();
  private tokenCreatedAt = new Map<ProgressToken, number>();
  private _readyPromise: Promise<void> | null = null;
  private _readyResolve: (() => void) | undefined;
  private _readyReject: ((err: Error) => void) | undefined;
  private _isReady = false;
  /** Whether this client generation ever reached concrete readiness. */
  private everReady = false;
  private noProgressTimer: ReturnType<typeof setTimeout> | null = null;
  private tokenTimeouts = new Map<ProgressToken, ReturnType<typeof setTimeout>>();
  /** Wall-clock start of the current client generation, for stall detection. */
  private startedAt = 0;

  // biome-ignore lint/complexity/useMaxParams: internal constructor keeps positional identity for test call sites
  constructor(
    name: string,
    private readonly config: ServerConfig,
    root: string,
    private readonly onLifecycleTransition?: LspClientLifecycleListener,
    /** Absolute workspace root for debug-telemetry identity. */
    readonly cwd?: string,
  ) {
    this.name = name;
    this.root = root;
    this.diagnostics = new ClientDiagnostics({
      server: name,
      cwd: cwd,
      isOperational: () => this.rpc !== null && this._status === "running",
      supportsPullDiagnostics: () => this.hasDiagnosticProvider,
      usesIncrementalDocumentSync: () => this.usesIncrementalDocumentSync,
      sendNotification: (method, params) => {
        if (this.rpc) void this.rpc.sendNotification(method, params);
      },
      pullDocumentDiagnostics: async (request) => {
        const rpc = this.rpc;
        if (!rpc || this._status !== "running") throw new Error("client not running");
        await this.getReady({
          signal: request.signal,
          deadline: request.deadline,
        });
        return rpc.sendRequest(
          DOCUMENT_DIAGNOSTIC_METHOD,
          {
            textDocument: { uri: request.uri },
            previousResultId: request.previousResultId,
          },
          {
            timeoutMs: request.timeoutMs,
            signal: request.signal,
            deadline: request.deadline,
            operationId: request.operationId,
          },
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

  /** Whether the server requires range-based document changes. */
  get usesIncrementalDocumentSync(): boolean {
    const sync = this.capabilities?.textDocumentSync;
    const change = typeof sync === "number" ? sync : sync?.change;
    return change === TextDocumentSyncKind.Incremental;
  }

  /** Whether the server is currently not indexing and ready to serve queries. */
  get ready(): boolean {
    return this._isReady;
  }

  /** Publish one client fact without letting an observer disrupt the client. */
  private publishLifecycle(kind: LspClientLifecycleTransitionKind): void {
    try {
      this.onLifecycleTransition?.(kind);
    } catch {
      // Lifecycle observers must not alter protocol behavior.
    }
  }

  // ── Lifecycle ───────────────────────────────────────────────────────
  /** Spawn the server process and perform the initialize handshake. */
  async start(): Promise<void> {
    const cmd = this.config.command;
    const args = this.config.args ?? [];
    this.startedAt = Date.now();

    try {
      this.process = spawn(cmd, args, {
        cwd: this.root,
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, ...this.config.env },
        // Run the server in its own process group so we can atomically
        // kill the entire tree (server + subprocesses like tsserver)
        // with `process.kill(-pid, signal)` on Unix or `taskkill /T` on Windows.
        detached: true,
      });
    } catch (err) {
      const failure = new Error(`Failed to spawn ${cmd}: ${err}`, { cause: err });
      this.handleProcessFailure(failure);
      throw failure;
    }

    if (!this.process.stdin || !this.process.stdout) {
      const failure = new Error(`${cmd}: missing stdin/stdout`);
      this.handleProcessFailure(failure);
      this.process.kill();
      throw failure;
    }

    this.rpc = new JsonRpcClient(this.process.stdout, this.process.stdin, {
      server: this.name,
      cwd: this.cwd,
    });

    // Handle notifications
    this.rpc.onNotification((method, params) => {
      if (method === "textDocument/publishDiagnostics") {
        this.handlePublishDiagnostics(params);
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
        workspaceFolders: [
          {
            uri: fileToUri(this.root),
            name: path.basename(this.root) || this.root,
          },
        ],
        capabilities: CLIENT_CAPABILITIES,
        initializationOptions: this.config.initializationOptions,
      })) as InitializeResult;

      const positionEncoding = result.capabilities.positionEncoding ?? "utf-16";
      if (positionEncoding !== "utf-16") {
        throw new Error(`Server selected unsupported position encoding "${positionEncoding}".`);
      }
      if (this._status !== "initializing") {
        throw new Error(`${this.name}: client shutdown during initialize`);
      }
      this.capabilities = result.capabilities;
      await this.rpc.sendNotification("initialized", {});
      if (this._status !== "initializing") {
        throw new Error(`${this.name}: client shutdown during initialize`);
      }
      this._status = "running";
      this.publishLifecycle("startup");

      this.armNoProgressTimer();
    } catch (err) {
      const failure = new Error(`${this.name}: initialize failed: ${err}`, { cause: err });
      this.handleProcessFailure(failure);
      this.process.kill();
      throw failure;
    }
  }

  /** Graceful shutdown: send shutdown → exit, kill after timeout. */
  async shutdown(): Promise<void> {
    if (this._status === "shutdown") return;
    this._status = "shutdown";
    this.diagnostics.clear();
    this.dynamicRegistrations.clear();
    this.cancelNoProgressTimer();
    this.rejectReady(new Error("Client shutdown"));
    this.publishLifecycle("shutdown");

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
  }

  /**
   * Terminate the process tree without a protocol handshake.
   *
   * Used when a replacement startup exceeds its recovery bound, so the
   * orphaned server process cannot outlive the failed restart.
   */
  async forceKill(): Promise<void> {
    const pid = this.process?.pid;
    this.rpc?.dispose();
    if (pid && this.process?.exitCode === null) {
      killProcessTree(pid);
      if (process.platform !== "win32") {
        // Escalate to SIGKILL after a brief grace period on Unix, mirroring
        // the graceful shutdown path for servers that ignore SIGTERM.
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
    this.handleProcessFailure(new Error("Client start bound exceeded"));
  }

  private handleProcessFailure(reason: Error): void {
    const didCrash = this._status !== "shutdown" && this._status !== "error";
    if (didCrash) {
      this._status = "error";
      this.cancelNoProgressTimer();
      this.rejectReady(reason);
    }
    this.diagnostics.clear({ preserveFailedDocuments: didCrash || this._status === "error" });
    this.dynamicRegistrations.clear();
    this.rpc?.dispose();
    if (didCrash) this.publishLifecycle("crash");
  }

  // ── Document Synchronization and Diagnostics ────────────────────────
  /** Open a document, or update it when it is already open. */
  didOpen(filePath: string, content: string): void {
    const trackedCount = this.openFiles.length;
    this.diagnostics.didOpen(filePath, content);
    this.publishTrackedFileChange(trackedCount);
  }

  /** Update a document, or open it when it is not tracked yet. */
  didChange(filePath: string, content: string): void {
    const trackedCount = this.openFiles.length;
    this.diagnostics.didChange(filePath, content);
    this.publishTrackedFileChange(trackedCount);
  }

  /** Close a document and remove its cached diagnostic state. */
  didClose(filePath: string): void {
    const trackedCount = this.openFiles.length;
    this.diagnostics.didClose(filePath);
    this.publishTrackedFileChange(trackedCount);
  }

  /** Remove missing document and diagnostic state, and return the removed paths. */
  pruneMissingFiles(): string[] {
    const trackedCount = this.openFiles.length;
    const removed = this.diagnostics.pruneMissingFiles();
    this.publishTrackedFileChange(trackedCount);
    return removed;
  }

  private publishTrackedFileChange(previousCount: number): void {
    if (this.openFiles.length !== previousCount) this.publishLifecycle("tracked-files");
  }

  /** Retain a failed document outcome when a replacement cannot reopen it. */
  markFailedFile(filePath: string): void {
    this.diagnostics.markFailedFile(filePath);
  }

  /**
   * Return the stall signal that justifies replacing this client's process,
   * or null when the client is healthy. Recovery restarts clients only on
   * these signals, never on unconfirmed evidence alone (ADR 0020).
   */
  getRecoveryStallSignal(): RecoveryRestartReason | null {
    if (this._status !== "running") return null;
    // The startup bound applies only before the client ever became ready: a
    // later readiness loss (a normal progress begin during indexing) is not
    // a startup stall.
    const pastStartupBound =
      this.startedAt > 0 && Date.now() - this.startedAt >= RECOVERY_CLIENT_STARTUP_BOUND_MS;
    if (!this.everReady && pastStartupBound) return "readiness-stall";
    if (this.hasUnbegunCreatedToken()) return "readiness-stall";
    if ((this.rpc?.getProtocolFailureCount() ?? 0) >= RECOVERY_PROTOCOL_FAILURE_THRESHOLD) {
      return "protocol-errors";
    }
    return null;
  }

  /** Test whether a created progress token never began within its per-token bound. */
  private hasUnbegunCreatedToken(): boolean {
    const boundMs = this.config.readinessTimeoutMs ?? 10_000;
    for (const [token, createdAt] of this.tokenCreatedAt) {
      if (this.trackedTokens.get(token) === "created" && Date.now() - createdAt >= boundMs) {
        return true;
      }
    }
    return false;
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
  getDiagnosticSnapshot(): ClientDiagnosticSnapshot {
    return this.diagnostics.getDiagnosticSnapshot();
  }

  getAllDiagnostics(): DiagnosticEntry[] {
    return this.getDiagnosticSnapshot().entries;
  }

  /** Force the next pull refresh to request complete diagnostic reports. */
  clearPullResultIds(): void {
    this.diagnostics.clearPullResultIds();
  }

  /** Check if server supports pull diagnostics. */
  get hasDiagnosticProvider(): boolean {
    // Static state: a valid `diagnosticProvider` in the initialize result.
    // Dynamic state: an active registration for the diagnostic method. A
    // malformed static shape or an empty dynamic set fails closed, so an
    // unsupported server never gets pull requests.
    return (
      isValidDiagnosticOptions(this.capabilities?.diagnosticProvider) ||
      this.dynamicRegistrations.has(DOCUMENT_DIAGNOSTIC_METHOD)
    );
  }

  /** Notify the server that watched workspace files changed. */
  notifyWorkspaceFileChanges(changes: FileEvent[]): void {
    if (!this.rpc || this._status !== "running" || changes.length === 0) return;
    this.diagnostics.invalidateCachedEvidence();
    void this.rpc.sendNotification("workspace/didChangeWatchedFiles", {
      changes,
    } satisfies DidChangeWatchedFilesParams);
  }

  /** Re-read open documents, then collect pull diagnostics or wait for push diagnostics. */
  async refreshOpenDiagnostics(
    options: { maxWaitMs?: number; quietMs?: number } & CodeRequestControl = {},
  ): Promise<DiagnosticEvidenceSummary> {
    return this.diagnostics.refreshOpenDiagnostics(options);
  }

  /** Sync one file and return diagnostics with explicit evidence availability. */
  async syncAndWaitForDiagnostics(
    filePath: string,
    content: string,
    control?: CodeRequestControl,
  ): Promise<CodeQueryResult<Diagnostic[]>> {
    return this.diagnostics.syncAndWaitForDiagnostics(filePath, content, control);
  }

  // ── LSP Requests ───────────────────────────────────────────────────
  async hover(
    filePath: string,
    position: Position,
    control?: CodeRequestControl,
  ): Promise<CodeQueryResult<Hover | null>> {
    return this.query(
      "textDocument/hover",
      { textDocument: { uri: fileToUri(filePath) }, position },
      control,
    );
  }

  async definition(
    filePath: string,
    position: Position,
    control?: CodeRequestControl,
  ): Promise<CodeQueryResult<Location | Location[] | LocationLink[] | null>> {
    return this.query(
      "textDocument/definition",
      { textDocument: { uri: fileToUri(filePath) }, position },
      control,
    );
  }

  async references(
    filePath: string,
    position: Position,
    control?: CodeRequestControl,
  ): Promise<CodeQueryResult<Location[] | null>> {
    return this.query(
      "textDocument/references",
      {
        textDocument: { uri: fileToUri(filePath) },
        position,
        context: { includeDeclaration: true },
      },
      control,
    );
  }

  async documentSymbols(
    filePath: string,
    control?: CodeRequestControl,
  ): Promise<CodeQueryResult<DocumentSymbol[] | SymbolInformation[] | null>> {
    return this.query(
      "textDocument/documentSymbol",
      { textDocument: { uri: fileToUri(filePath) } },
      control,
    );
  }

  async workspaceSymbol(
    query: string,
    control?: CodeRequestControl,
  ): Promise<CodeQueryResult<SymbolInformation[] | WorkspaceSymbol[] | null>> {
    if (!this.capabilities?.workspaceSymbolProvider) {
      return unavailableCodeQuery("Workspace-symbol requests are not supported by this server.");
    }
    return this.query("workspace/symbol", { query }, control);
  }

  async rename(
    filePath: string,
    position: Position,
    newName: string,
    control?: CodeRequestControl,
  ): Promise<WorkspaceEdit | null> {
    return this.request(
      "textDocument/rename",
      { textDocument: { uri: fileToUri(filePath) }, position, newName },
      control,
    );
  }

  async codeActions(
    filePath: string,
    range: Range,
    context: CodeActionContext,
    control?: CodeRequestControl,
  ): Promise<CodeAction[] | null> {
    return this.request(
      "textDocument/codeAction",
      { textDocument: { uri: fileToUri(filePath) }, range, context },
      control,
    );
  }

  async implementation(
    filePath: string,
    position: Position,
    control?: CodeRequestControl,
  ): Promise<CodeQueryResult<Location | Location[] | LocationLink[] | null>> {
    if (!this.capabilities?.implementationProvider) {
      return unavailableCodeQuery("Implementation requests are not supported by this server.");
    }
    return this.query(
      "textDocument/implementation",
      { textDocument: { uri: fileToUri(filePath) }, position },
      control,
    );
  }

  // ── Private ─────────────────────────────────────────────────────────
  private async query<T>(
    method: string,
    params: unknown,
    control?: CodeRequestControl,
  ): Promise<CodeQueryResult<T | null>> {
    // An already-cancelled caller gets the interruption, not an unavailable
    // outcome that could mask the cancellation.
    throwIfCodeRequestInterrupted(control);
    if (!this.rpc || this._status !== "running") {
      return unavailableCodeQuery(
        `LSP request ${method} is unavailable because the client is not running.`,
      );
    }
    try {
      await this.getReady(control);
      const data = (await this.rpc.sendRequest(method, params, control)) as T | null | undefined;
      return completedCodeQuery(data ?? null);
    } catch (error) {
      // Cancellation and absolute-deadline expiry propagate as interruptions:
      // the caller no longer awaits a result, so no unavailable outcome may
      // mask the cancellation.
      if (isCodeRequestInterruption(error, control)) throw error;
      const detail = error instanceof Error ? error.message : String(error);
      return unavailableCodeQuery(`LSP request ${method} failed: ${detail}`);
    }
  }

  private async request<T>(
    method: string,
    params: unknown,
    control?: CodeRequestControl,
  ): Promise<T | null> {
    const result = await this.query<T>(method, params, control);
    return result.kind === "unavailable" ? null : result.data;
  }

  private handleServerRequest(method: string, params: unknown): unknown {
    switch (method) {
      case "workspace/configuration":
        return this.buildWorkspaceConfigurationResult(params);
      case "workspace/workspaceFolders":
        return [{ uri: fileToUri(this.root), name: path.basename(this.root) || this.root }];
      case "client/registerCapability":
        return this.handleRegisterCapability(params);
      case "client/unregisterCapability":
        return this.handleUnregisterCapability(params);
      case "workspace/diagnostic/refresh":
        // Refresh the tracked diagnostic set without blocking the server's
        // request. The LSP response is always null; the pass records its
        // terminal result asynchronously for local protocol diagnosis.
        return this.handleServerDiagnosticRefreshRequest();
      case "window/workDoneProgress/create": {
        // A create reserves a token; it does not prove active work. The
        // token stays pending and readiness is untouched until a begin
        // arrives, so an unused token never causes false readiness loss.
        const token = (params as { token: ProgressToken }).token;
        this.trackedTokens.set(token, "created");
        this.tokenCreatedAt.set(token, Date.now());
        return null;
      }
      default:
        throw new JsonRpcRequestError(-32601, `Method not found: ${method}`);
    }
  }

  /** Run a server-requested refresh through the forced diagnostic path. */
  private refreshForServerRequest(): Promise<DiagnosticEvidenceSummary> {
    return this.diagnostics.refreshForServerRequest();
  }

  private handleServerDiagnosticRefreshRequest(): null {
    // Defer the pass before invoking it. Its setup rereads and resynchronizes
    // tracked documents, so even an async method can otherwise delay the null
    // response on the JSON-RPC request stack.
    void Promise.resolve()
      .then(() => this.refreshForServerRequest())
      .then(
        (evidence) => this.recordDiagnosticRefreshRequest("completed", evidence),
        () => this.recordDiagnosticRefreshRequest("failed"),
      )
      // Consume failures from the telemetry callback as well as the pass.
      .catch(() => {});
    return null;
  }

  private recordDiagnosticRefreshRequest(
    outcome: "completed" | "failed",
    evidence?: DiagnosticEvidenceSummary,
  ): void {
    recordDebugEvent({
      source: "lsp",
      level: "debug",
      category: "diagnostics.refresh-request",
      message: `LSP diagnostic refresh request ${outcome}`,
      cwd: boundCwd(this.cwd),
      data:
        outcome === "completed" && evidence
          ? {
              outcome,
              server: truncateIdentity(this.name),
              requested: evidence.requested,
              confirmed: evidence.confirmed,
              unconfirmed: evidence.unconfirmed,
              failed: evidence.failed,
              removed: evidence.removed,
            }
          : { outcome, server: truncateIdentity(this.name) },
    });
  }

  private buildWorkspaceConfigurationResult(params: unknown): unknown[] {
    if (!params || typeof params !== "object") return [];
    const items = (params as { items?: unknown }).items;
    if (!Array.isArray(items)) return [];
    return items.map(() => null);
  }

  /**
   * Apply a dynamic registration for `textDocument/diagnostic`.
   *
   * Registrations for other methods are ignored (status quo). Malformed
   * params or malformed diagnostic registration options reject the request
   * without enabling pull, so a server never gets pull requests it did not
   * validly register for.
   */
  private handleRegisterCapability(params: unknown): null {
    const registrations = readRegistrations(params, "client/registerCapability");
    for (const registration of registrations) {
      if (registration.method !== DOCUMENT_DIAGNOSTIC_METHOD) continue;
      if (!isValidDiagnosticOptions(registration.registerOptions)) {
        throw new JsonRpcRequestError(
          -32602,
          "Malformed textDocument/diagnostic registration options.",
        );
      }
      this.dynamicRegistrations.register(registration.method, registration.id);
    }
    return null;
  }

  /**
   * Remove dynamic registrations for `textDocument/diagnostic`.
   *
   * The params key is the LSP specification's documented compatibility typo
   * `unregisterations` (renamed to `unregistrations` only in a future 4.x).
   * Capability loss disables pull as soon as the last id is removed.
   */
  private handleUnregisterCapability(params: unknown): null {
    if (!isRecord(params) || !Array.isArray(params.unregisterations)) {
      throw new JsonRpcRequestError(-32602, "Malformed client/unregisterCapability params.");
    }
    for (const entry of params.unregisterations) {
      if (!isRecord(entry) || typeof entry.id !== "string" || typeof entry.method !== "string") {
        throw new JsonRpcRequestError(-32602, "Malformed client/unregisterCapability entry.");
      }
      if (entry.method !== DOCUMENT_DIAGNOSTIC_METHOD) continue;
      this.dynamicRegistrations.unregister(entry.method, entry.id);
    }
    return null;
  }

  /** Apply a diagnostic publication received from the LSP transport. */
  handlePublishDiagnostics(params: unknown): void {
    this.diagnostics.handlePublishDiagnostics(params);
  }

  // ── Readiness (work-done-progress) ──────────────────────────────────

  /**
   * Wait for the server to be ready to serve queries.
   * Returns immediately if already ready; returns the ongoing promise
   * if one is pending; creates and returns a new one otherwise.
   * With request control, the caller's wait stops promptly on abort or
   * deadline while the shared readiness state keeps its own lifecycle.
   */
  async getReady(control?: CodeRequestControl): Promise<void> {
    const pending = this.pendingReady();
    if (!control) return pending;
    return raceRequestControl(pending, control);
  }

  private pendingReady(): Promise<void> {
    if (this._isReady) return Promise.resolve();
    if (this._readyPromise !== null) return this._readyPromise;
    // If no progress timer was ever armed and no tokens are tracked,
    // the server was either never started with a real process (test scenario)
    // or completed before any progress tracking began. Resolve immediately
    // only when the client is still running — a crash or shutdown clears
    // both fields but must not report the client as ready.
    if (this.noProgressTimer === null && this.trackedTokens.size === 0) {
      if (this._status === "running") {
        this._isReady = true;
        this.everReady = true;
      }
      return Promise.resolve();
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
        message: `Readiness progress begin for ${this.name}`,
        cwd: boundCwd(this.cwd),
        data: { server: truncateIdentity(this.name), root: truncateIdentity(this.root) },
      });
      // begin is the only transition that proves active work: it cancels
      // the no-progress grace timer, blocks readiness, and arms the
      // bounded per-token timeout. A server that sends begin without a
      // prior create is spec-deviant but valid.
      this.cancelNoProgressTimer();
      this.trackedTokens.set(token, "active");
      this.tokenCreatedAt.delete(token);
      const wasReady = this._isReady;
      this._isReady = false;
      if (wasReady) this.publishLifecycle("readiness");
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
        message: `Readiness progress end for ${this.name}`,
        cwd: boundCwd(this.cwd),
        data: { server: truncateIdentity(this.name), root: truncateIdentity(this.root) },
      });
      const state = this.trackedTokens.get(token);
      if (state === undefined) return; // Unknown token: ignore fail-closed.
      this.tokenCreatedAt.delete(token);
      if (state === "created") {
        // A pending token never blocked readiness; its end removes it.
        this.trackedTokens.delete(token);
        return;
      }
      this.trackedTokens.set(token, "ended");
      this.clearTokenTimeout(token);
      this.checkAllTokensEnded();
    }
    // kind: "report" — intentionally no-op; active state is retained.
  }

  /** Test whether any token has active (begun) work. */
  private hasActiveTokens(): boolean {
    for (const state of this.trackedTokens.values()) {
      if (state === "active") return true;
    }
    return false;
  }

  /** Resolve readiness when no token is active; pending tokens do not block. */
  private checkAllTokensEnded(): void {
    if (this.hasActiveTokens()) return;
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
    // A rejected or disposed client must never be marked ready again,
    // even if a stray progress end arrives after the rejection.
    if (this._status !== "running") return;
    const becameReady = !this._isReady;
    this._isReady = true;
    if (becameReady) this.everReady = true;
    if (becameReady) this.publishLifecycle("readiness");
    recordDebugEvent({
      source: "lsp",
      level: "info",
      category: "readiness.resolved",
      message: `LSP client ${this.name} is ready`,
      cwd: boundCwd(this.cwd),
      data: { server: truncateIdentity(this.name), root: truncateIdentity(this.root) },
    });
  }

  /**
   * Tear down readiness state without a protocol shutdown.
   *
   * Clears pending and active progress tokens and rejects any pending
   * readiness. Called when a client is discarded or its observer is
   * disposed so token state cannot outlive the client.
   */
  dispose(): void {
    this.cancelNoProgressTimer();
    this.dynamicRegistrations.clear();
    this.rejectReady(new Error("Client disposed"));
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
    this.tokenCreatedAt.clear();
    for (const timer of this.tokenTimeouts.values()) clearTimeout(timer);
    this.tokenTimeouts.clear();
    recordDebugEvent({
      source: "lsp",
      level: this._status === "shutdown" ? "debug" : "warning",
      category: "readiness.rejected",
      message: `LSP client ${this.name} readiness rejected: ${reason.message}`,
      cwd: boundCwd(this.cwd),
      data: {
        server: truncateIdentity(this.name),
        root: truncateIdentity(this.root),
        status: this._status,
      },
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
        message: `Readiness per-token timeout fired for ${this.name} after ${timeoutMs}ms`,
        cwd: boundCwd(this.cwd),
        data: { server: truncateIdentity(this.name), root: truncateIdentity(this.root), timeoutMs },
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
        cwd: boundCwd(this.cwd),
        data: { server: truncateIdentity(this.name), root: truncateIdentity(this.root) },
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
      if (!this.hasActiveTokens() && this._status === "running") {
        recordDebugEvent({
          source: "lsp",
          level: "debug",
          category: "readiness.no-progress-resolved",
          message: `No-progress grace timer resolved for ${this.name}`,
          cwd: boundCwd(this.cwd),
          data: { server: truncateIdentity(this.name), root: truncateIdentity(this.root) },
        });
        this.resolveReady();
      }
      this.noProgressTimer = null;
    }, 2_000);
  }
}
