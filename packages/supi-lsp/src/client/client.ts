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
import {
  recordDebugEvent,
  truncateDebugIdentity as truncateIdentity,
} from "@mrclrchtr/supi-core/debug";
import { fileToUri, uriToFile } from "@mrclrchtr/supi-core/path";
import { type ProgressToken, TextDocumentSyncKind } from "vscode-languageserver-protocol";
import { CodeActionTriggerKind } from "vscode-languageserver-types";
import { CLIENT_CAPABILITIES } from "../config/capabilities.ts";
import {
  getServerOperationSupport,
  supportsCodeActionResolve,
  supportsCodeActions,
  supportsPrepareRename,
  supportsRename,
  supportsRequestedCodeActionKinds,
} from "../config/operation-support.ts";
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
  JsonObject,
  JsonValue,
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
import { boundCwd } from "../debug-telemetry.ts";
import type { DiagnosticEvidenceSummary } from "../diagnostics/evidence.ts";
import { raceRequestControl } from "../session/readiness.ts";
import {
  ClientDynamicRegistrations,
  DOCUMENT_DIAGNOSTIC_METHOD,
  isDocumentSelectorApplicable,
  isValidDiagnosticOptions,
} from "./client-diagnostic-capabilities.ts";
import type {
  DiagnosticPullRequest,
  DiagnosticRequestAdapter,
  DiagnosticRequestExecution,
} from "./client-diagnostic-request.ts";
import { createPriorityDiagnosticRequestAdapter } from "./client-diagnostic-request.ts";
import { createTypeScriptDiagnosticRequestAdapter } from "./client-diagnostic-typescript.ts";
import { ClientDiagnostics } from "./client-diagnostics.ts";
import type { ClientDiagnosticSnapshot, DiagnosticEntry } from "./client-document-state.ts";
import { type NormalizedDocumentSync, normalizeDocumentSync } from "./client-document-sync.ts";
import { SemanticInputRequestRetryGuard } from "./client-request-enrollment.ts";
import {
  isSemanticInputEnrollmentError,
  SemanticInputSynchronizationError,
} from "./client-semantic-input-errors.ts";
import { JsonRpcClient, JsonRpcRequestError } from "./transport.ts";

const SHUTDOWN_TIMEOUT_MS = 5_000;

interface SemanticRequestAttemptState {
  inputRevision: number | undefined;
}

interface RefactorTransaction {
  rpc: JsonRpcClient;
  assertCurrent: () => Promise<void>;
}

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

function isPosition(value: unknown): value is Position {
  return (
    isRecord(value) &&
    Object.hasOwn(value, "line") &&
    Object.hasOwn(value, "character") &&
    Object.keys(value).every((key) => key === "line" || key === "character") &&
    Number.isInteger(value.line) &&
    (value.line as number) >= 0 &&
    Number.isInteger(value.character) &&
    (value.character as number) >= 0
  );
}

function isRange(value: unknown): value is Range {
  return (
    isRecord(value) &&
    Object.hasOwn(value, "start") &&
    Object.hasOwn(value, "end") &&
    Object.keys(value).every((key) => key === "start" || key === "end") &&
    isPosition(value.start) &&
    isPosition(value.end) &&
    !isBefore(value.end, value.start)
  );
}

function isBefore(left: Position, right: Position): boolean {
  return left.line < right.line || (left.line === right.line && left.character < right.character);
}

function isPositionInRange(position: Position, range: Range): boolean {
  return !isBefore(position, range.start) && !isBefore(range.end, position);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const allowedKeys = new Set(allowed);
  return Object.keys(value).every((key) => allowedKeys.has(key));
}

function validatePrepareRenameResult(value: unknown, position: Position): string | null {
  if (value === null || value === undefined) {
    return "Rename is unavailable at the requested position.";
  }
  if (!isRecord(value)) return "LSP server returned a malformed prepareRename result.";
  if (isRange(value)) {
    return isPositionInRange(position, value)
      ? null
      : "LSP server returned a prepareRename range that excludes the requested position.";
  }
  if (
    hasOnlyKeys(value, ["range", "placeholder"]) &&
    Object.hasOwn(value, "range") &&
    Object.hasOwn(value, "placeholder") &&
    typeof value.placeholder === "string" &&
    isRange(value.range)
  ) {
    return isPositionInRange(position, value.range)
      ? null
      : "LSP server returned a prepareRename range that excludes the requested position.";
  }
  if (
    hasOnlyKeys(value, ["defaultBehavior"]) &&
    Object.hasOwn(value, "defaultBehavior") &&
    typeof value.defaultBehavior === "boolean"
  ) {
    return null;
  }
  return "LSP server returned a malformed prepareRename result.";
}

function isLazyCodeAction(value: unknown): value is CodeAction {
  return (
    isRecord(value) &&
    Object.hasOwn(value, "title") &&
    typeof value.title === "string" &&
    value.title.trim().length > 0 &&
    !Object.hasOwn(value, "edit") &&
    !Object.hasOwn(value, "command") &&
    !Object.hasOwn(value, "disabled") &&
    hasNoInheritedAllowedKeys(value, [
      "title",
      "kind",
      "diagnostics",
      "isPreferred",
      "disabled",
      "edit",
      "command",
      "data",
    ])
  );
}

function codeActionKindMatchesFilter(kind: unknown, filter: string): boolean {
  return (
    filter === "" ||
    (typeof kind === "string" && (kind === filter || kind.startsWith(`${filter}.`)))
  );
}

function isValidCommand(value: unknown): value is NonNullable<CodeAction["command"]> {
  const command = isRecord(value) ? value : null;
  return (
    command !== null &&
    Object.hasOwn(command, "title") &&
    typeof command.title === "string" &&
    command.title.trim().length > 0 &&
    Object.hasOwn(command, "command") &&
    typeof command.command === "string" &&
    hasOnlyKeys(command, ["title", "tooltip", "command", "arguments"]) &&
    hasNoInheritedAllowedKeys(command, ["title", "tooltip", "command", "arguments"]) &&
    (!Object.hasOwn(command, "tooltip") || typeof command.tooltip === "string") &&
    (!Object.hasOwn(command, "arguments") || Array.isArray(command.arguments))
  );
}

/** Validate one code-action response before matching or lazy resolution. */
function normalizeCodeActionResponseEntry(value: unknown): CodeAction | null {
  const entry = isRecord(value) ? value : null;
  if (!hasValidCodeActionTitle(entry)) return null;

  // A protocol response may be a Command, not only a CodeAction. Keep it as
  // an edit-less CodeAction so later planning reports it as unsupported.
  if (typeof entry.command === "string") return normalizeCommandCodeAction(entry);
  return isValidCodeActionEntry(entry) ? (entry as CodeAction) : null;
}

function hasValidCodeActionTitle(
  entry: Record<string, unknown> | null,
): entry is Record<string, unknown> {
  return (
    entry !== null &&
    Object.hasOwn(entry, "title") &&
    typeof entry.title === "string" &&
    entry.title.trim().length > 0
  );
}

function normalizeCommandCodeAction(entry: Record<string, unknown>): CodeAction | null {
  return hasOnlyKeys(entry, ["title", "tooltip", "command", "arguments"]) && isValidCommand(entry)
    ? { title: entry.title as string, command: entry as NonNullable<CodeAction["command"]> }
    : null;
}

function isValidCodeActionEntry(entry: Record<string, unknown>): boolean {
  return (
    hasOnlyKeys(entry, [
      "title",
      "kind",
      "diagnostics",
      "isPreferred",
      "disabled",
      "edit",
      "command",
      "data",
      "tags",
    ]) &&
    hasNoInheritedAllowedKeys(entry, [
      "title",
      "kind",
      "diagnostics",
      "isPreferred",
      "disabled",
      "edit",
      "command",
      "data",
      "tags",
    ]) &&
    isValidOptionalCodeActionFields(entry)
  );
}

function isValidOptionalCodeActionFields(entry: Record<string, unknown>): boolean {
  return (
    (!Object.hasOwn(entry, "kind") || typeof entry.kind === "string") &&
    (!Object.hasOwn(entry, "diagnostics") || Array.isArray(entry.diagnostics)) &&
    (!Object.hasOwn(entry, "isPreferred") || typeof entry.isPreferred === "boolean") &&
    (!Object.hasOwn(entry, "disabled") || isValidDisabledCodeAction(entry.disabled)) &&
    (!Object.hasOwn(entry, "command") || isValidCommand(entry.command)) &&
    (!Object.hasOwn(entry, "tags") || Array.isArray(entry.tags))
  );
}

function isValidDisabledCodeAction(value: unknown): boolean {
  const disabled = isRecord(value) ? value : null;
  return (
    disabled !== null &&
    Object.hasOwn(disabled, "reason") &&
    typeof disabled.reason === "string" &&
    hasOnlyKeys(disabled, ["reason"]) &&
    hasNoInheritedAllowedKeys(disabled, ["reason"])
  );
}

function hasNoInheritedAllowedKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  return allowed.every((key) => !(key in value) || Object.hasOwn(value, key));
}

function isCodeActionContext(value: unknown): value is CodeActionContext {
  if (
    !isRecord(value) ||
    !Object.hasOwn(value, "diagnostics") ||
    !Array.isArray(value.diagnostics)
  ) {
    return false;
  }
  if (
    !hasOnlyKeys(value, ["diagnostics", "only", "triggerKind"]) ||
    !hasNoInheritedAllowedKeys(value, ["diagnostics", "only", "triggerKind"])
  ) {
    return false;
  }
  if (
    Object.hasOwn(value, "only") &&
    value.only !== undefined &&
    (!Array.isArray(value.only) ||
      value.only.some(
        (kind) => typeof kind !== "string" || (kind.length > 0 && kind.trim().length === 0),
      ))
  ) {
    return false;
  }
  return (
    !Object.hasOwn(value, "triggerKind") ||
    value.triggerKind === undefined ||
    value.triggerKind === CodeActionTriggerKind.Invoked ||
    value.triggerKind === CodeActionTriggerKind.Automatic
  );
}

const EMPTY_SETTINGS: JsonObject = Object.freeze({});

/** Clone and freeze a JSON settings value so one client owns one stable snapshot. */
function cloneJsonValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return Object.freeze(value.map((entry) => cloneJsonValue(entry))) as JsonValue;
  }
  if (isRecord(value)) {
    const clone: Record<string, JsonValue> = Object.create(null);
    for (const [key, entry] of Object.entries(value)) {
      clone[key] = cloneJsonValue(entry as JsonValue);
    }
    return Object.freeze(clone) as JsonValue;
  }
  return value;
}

function cloneSettings(settings: JsonObject | undefined): JsonObject | undefined {
  return settings === undefined ? undefined : (cloneJsonValue(settings) as JsonObject);
}

/** Resolve a dotted section against an own-property-only JSON settings tree. */
function lookupSettings(settings: JsonObject, section: unknown): JsonValue | undefined {
  if (section === undefined || section === "") return settings;
  if (typeof section !== "string") return undefined;
  const parts = section.split(".");
  if (parts.some((part) => part.length === 0)) return undefined;

  let current: JsonValue = settings;
  for (const part of parts) {
    if (!isRecord(current) || !Object.hasOwn(current, part)) return undefined;
    current = current[part] as JsonValue;
  }
  return current;
}

/** Test whether a configuration scope URI belongs to this server workspace. */
function isApplicableConfigurationScope(scopeUri: unknown, root: string): boolean {
  if (scopeUri === undefined) return true;
  if (typeof scopeUri !== "string" || !scopeUri.startsWith("file://")) return false;
  let scopePath: string;
  try {
    scopePath = uriToFile(scopeUri);
  } catch {
    return false;
  }
  if (scopePath === scopeUri) return false;
  const relative = path.relative(path.resolve(root), path.resolve(scopePath));
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
  );
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

/** Terminate a failed startup without leaving server descendants running. */
function killFailedStartupProcess(child: ChildProcess): void {
  if (child.pid) {
    killProcessTree(child.pid);
    return;
  }
  child.kill();
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
  /** Negotiated once after initialize for this client generation. */
  private normalizedDocumentSync: NormalizedDocumentSync = normalizeDocumentSync(undefined);
  /** Stable server-owned settings for this client generation. */
  private readonly settingsSnapshot: JsonObject | undefined;
  private readonly diagnosticRequestAdapter: DiagnosticRequestAdapter;
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
    this.settingsSnapshot = cloneSettings(config.settings);
    const nativeDiagnosticAdapter: DiagnosticRequestAdapter = {
      supports: (uri) => this.hasApplicableDiagnosticProvider(uri),
      sourceFor: (uri) => (this.hasApplicableDiagnosticProvider(uri) ? "pull" : undefined),
      collect: (request) => this.startNativeDiagnosticRequest(request),
    };
    const typescriptDiagnosticAdapter = createTypeScriptDiagnosticRequestAdapter({
      fileTypes: config.fileTypes,
      cwd: cwd ?? root,
      isSupportedRoute: () => this.isSupportedTypeScriptRoute(),
      hasCommand: () => this.hasTypeScriptRequestCommand(),
      getReady: () => this.getReady(),
      sendRequestOwned: (method, params, options) => {
        const rpc = this.rpc;
        if (!rpc || this._status !== "running") {
          return {
            result: Promise.reject(new Error("client not running")),
            settled: Promise.resolve(),
          };
        }
        return rpc.sendRequestOwned(method, params, options);
      },
    });
    this.diagnosticRequestAdapter = createPriorityDiagnosticRequestAdapter([
      nativeDiagnosticAdapter,
      typescriptDiagnosticAdapter,
    ]);
    this.diagnostics = new ClientDiagnostics({
      server: name,
      cwd: cwd,
      isOperational: () => this.rpc !== null && this._status === "running",
      diagnosticRequestAdapter: this.diagnosticRequestAdapter,
      documentSync: () => this.getDocumentSyncOptions(),
      sendNotification: (method, params) => {
        if (!this.shouldSendDocumentNotification(method)) return;
        if (this.rpc) void this.rpc.sendNotification(method, params);
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

  /** Whether this route advertises the standard rename request. */
  get supportsRename(): boolean {
    return supportsRename(this.capabilities);
  }

  /** Whether this route advertises `textDocument/prepareRename`. */
  get supportsPrepareRename(): boolean {
    return supportsPrepareRename(this.capabilities);
  }

  /** Whether this route advertises `textDocument/codeAction`. */
  get supportsCodeActions(): boolean {
    return supportsCodeActions(this.capabilities);
  }

  /** Whether this route advertises standard code-action resolution. */
  get supportsCodeActionResolve(): boolean {
    return supportsCodeActionResolve(this.capabilities);
  }

  /** Capability facts used by the project-server health surface. */
  get operationSupport() {
    return getServerOperationSupport(this.capabilities);
  }

  /** Whether the server can answer a request for each supplied code-action kind. */
  supportsCodeActionKinds(requested: readonly string[]): boolean {
    return supportsRequestedCodeActionKinds(this.capabilities, requested);
  }

  /** Whether the server requires range-based document changes. */
  get usesIncrementalDocumentSync(): boolean {
    return this.getDocumentSyncOptions().change === TextDocumentSyncKind.Incremental;
  }

  private getDocumentSyncOptions(): NormalizedDocumentSync {
    return this.normalizedDocumentSync;
  }

  /** Filter document lifecycle traffic against the negotiated server options. */
  private shouldSendDocumentNotification(method: string): boolean {
    const sync = this.getDocumentSyncOptions();
    if (method === "textDocument/didOpen" || method === "textDocument/didClose") {
      return sync.openClose;
    }
    if (method === "textDocument/didChange") return sync.change !== TextDocumentSyncKind.None;
    if (method === "textDocument/didSave") return sync.save;
    return true;
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
      killFailedStartupProcess(this.process);
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
      this.normalizedDocumentSync = normalizeDocumentSync(result.capabilities.textDocumentSync);
      await this.rpc.sendNotification("initialized", {});
      if (this._status !== "initializing") {
        throw new Error(`${this.name}: client shutdown during initialize`);
      }
      this._status = "running";
      this.publishLifecycle("startup");
      this.sendInitialConfigurationChange();

      this.armNoProgressTimer();
    } catch (err) {
      const failure = new Error(`${this.name}: initialize failed: ${err}`, { cause: err });
      this.handleProcessFailure(failure);
      killFailedStartupProcess(this.process);
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

  /** Check if the server advertises a valid native pull provider. */
  get hasDiagnosticProvider(): boolean {
    return (
      isValidDiagnosticOptions(this.capabilities?.diagnosticProvider) ||
      this.dynamicRegistrations.has(DOCUMENT_DIAGNOSTIC_METHOD)
    );
  }

  /** Whether this route has either native pull or the tested TypeScript adapter. */
  get hasDiagnosticRequestAdapter(): boolean {
    return this.hasDiagnosticProvider || this.isSupportedTypeScriptRouteAndCommand();
  }

  /** Select a native provider that applies to one document. */
  private getDiagnosticProviderOptions(uri: string): Record<string, unknown> | undefined {
    const staticOptions = this.capabilities?.diagnosticProvider;
    const staticRecord = staticOptions as Record<string, unknown> | undefined;
    if (
      staticRecord !== undefined &&
      isValidDiagnosticOptions(staticRecord) &&
      isDocumentSelectorApplicable(staticRecord.documentSelector, uri)
    ) {
      return staticRecord;
    }
    for (const registration of this.dynamicRegistrations.get(DOCUMENT_DIAGNOSTIC_METHOD)) {
      if (isDocumentSelectorApplicable(registration.options.documentSelector, uri)) {
        return registration.options;
      }
    }
    return undefined;
  }

  private hasApplicableDiagnosticProvider(uri: string): boolean {
    return this.getDiagnosticProviderOptions(uri) !== undefined;
  }

  private isSupportedTypeScriptRoute(): boolean {
    const command = path.basename(this.config.command).replace(/\.(?:cmd|exe)$/i, "");
    return command === "typescript-language-server";
  }

  private isSupportedTypeScriptRouteAndCommand(): boolean {
    return (
      this.isSupportedTypeScriptRoute() &&
      Array.isArray(this.capabilities?.executeCommandProvider?.commands) &&
      this.capabilities.executeCommandProvider.commands.includes("typescript.tsserverRequest")
    );
  }

  private hasTypeScriptRequestCommand(): boolean {
    return this.isSupportedTypeScriptRouteAndCommand();
  }

  /** Start one native pull request without transferring caller ownership. */
  private startNativeDiagnosticRequest(request: DiagnosticPullRequest): DiagnosticRequestExecution<{
    source: "pull";
    report: DocumentDiagnosticReport;
  }> {
    let activeSettled = Promise.resolve();
    const result = (async () => {
      const ownerDeadline = Number.isFinite(request.timeoutMs)
        ? Date.now() + request.timeoutMs
        : undefined;
      await raceRequestControl(this.getReady(), {
        signal: request.signal,
        deadline: ownerDeadline,
      });
      const rpc = this.rpc;
      if (!rpc || this._status !== "running") throw new Error("client not running");
      const provider = this.getDiagnosticProviderOptions(request.uri);
      if (!provider) throw new Error("No native diagnostic provider applies to this document.");
      const owned = rpc.sendRequestOwned(
        DOCUMENT_DIAGNOSTIC_METHOD,
        {
          textDocument: { uri: request.uri },
          previousResultId: request.previousResultId,
          ...(typeof provider.identifier === "string" ? { identifier: provider.identifier } : {}),
        },
        {
          timeoutMs: request.timeoutMs,
          deadline: ownerDeadline,
          ...(request.operationId !== undefined ? { operationId: request.operationId } : {}),
        },
      );
      activeSettled = owned.settled;
      const report = (await raceRequestControl(owned.result, {
        signal: request.signal,
        deadline: ownerDeadline,
      })) as DocumentDiagnosticReport;
      return { source: "pull" as const, report };
    })();
    const settled = result
      .then(
        () => activeSettled,
        () => activeSettled,
      )
      .then(() => undefined);
    result.catch(() => {});
    settled.catch(() => {});
    return { result, settled };
  }

  /** Notify the server that watched workspace files changed. */
  notifyWorkspaceFileChanges(changes: FileEvent[]): void {
    if (!this.rpc || this._status !== "running" || changes.length === 0) return;
    this.diagnostics.invalidateCachedEvidence();
    void this.rpc.sendNotification("workspace/didChangeWatchedFiles", {
      changes,
    } satisfies DidChangeWatchedFilesParams);
  }

  /** Synchronize a tracked file and notify the server after a real disk write. */
  noteWorkspaceWrite(filePath: string): void {
    this.diagnostics.noteWorkspaceWrite(filePath);
  }

  /** Re-read open documents, then collect pull diagnostics or wait for push diagnostics. */
  async refreshOpenDiagnostics(
    options: { maxWaitMs?: number; quietMs?: number } & CodeRequestControl = {},
  ): Promise<DiagnosticEvidenceSummary> {
    return this.diagnostics.refreshOpenDiagnostics(options);
  }

  /**
   * Sync one file and return diagnostics with explicit evidence availability.
   * The manager disables content authority so this barrier can detect a disk
   * deletion between the manager read and the client request.
   */
  async syncAndWaitForDiagnostics(
    filePath: string,
    content: string,
    control?: CodeRequestControl,
    options: { contentIsAuthoritative?: boolean } = {},
  ): Promise<CodeQueryResult<Diagnostic[]>> {
    return this.diagnostics.syncAndWaitForDiagnostics(filePath, content, control, options);
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
    const result = await this.renameDetailed(filePath, position, newName, control);
    return result.kind === "completed" ? result.data : null;
  }

  /** Run rename with capability gating, optional preparation, and freshness checks. */
  async renameDetailed(
    filePath: string,
    position: Position,
    newName: string,
    control?: CodeRequestControl,
  ): Promise<CodeQueryResult<WorkspaceEdit | null>> {
    if (!this.supportsRename) {
      return unavailableCodeQuery("The server does not advertise textDocument/rename.");
    }
    if (
      typeof filePath !== "string" ||
      filePath.length === 0 ||
      !isPosition(position) ||
      typeof newName !== "string" ||
      newName.trim().length === 0
    ) {
      return unavailableCodeQuery(
        "Rename requires a valid file, position, and non-empty new name.",
      );
    }

    const params = {
      textDocument: { uri: fileToUri(filePath) },
      position,
      newName,
    };
    return this.runRefactorTransaction("textDocument/rename", control, async (transaction) => {
      if (this.supportsPrepareRename) {
        const prepared = await transaction.rpc.sendRequest(
          "textDocument/prepareRename",
          { textDocument: { uri: fileToUri(filePath) }, position },
          control,
        );
        const preparationError = validatePrepareRenameResult(prepared, position);
        if (preparationError) throw new Error(preparationError);
        await transaction.assertCurrent();
      }
      return (await transaction.rpc.sendRequest("textDocument/rename", params, control)) as
        | WorkspaceEdit
        | null
        | undefined;
    });
  }

  async codeActions(
    filePath: string,
    range: Range,
    context: CodeActionContext,
    control?: CodeRequestControl,
  ): Promise<CodeAction[] | null> {
    const result = await this.codeActionsDetailed(filePath, range, context, control);
    return result.kind === "completed" ? result.data : null;
  }

  /** Run code actions with explicit context, standard resolution, and freshness checks. */
  async codeActionsDetailed(
    filePath: string,
    range: Range,
    context: CodeActionContext,
    control?: CodeRequestControl,
  ): Promise<CodeQueryResult<CodeAction[] | null>> {
    if (!this.supportsCodeActions) {
      return unavailableCodeQuery("The server does not advertise textDocument/codeAction.");
    }
    if (typeof filePath !== "string" || filePath.length === 0 || !isRange(range)) {
      return unavailableCodeQuery("Code actions require a valid file and range.");
    }
    if (!isCodeActionContext(context)) {
      return unavailableCodeQuery("Code actions require a valid context.");
    }
    if (context.only && !this.supportsCodeActionKinds(context.only)) {
      return unavailableCodeQuery("The server does not advertise the requested code-action kind.");
    }

    const requestContext: CodeActionContext = {
      ...context,
      triggerKind: context.triggerKind ?? CodeActionTriggerKind.Invoked,
      ...(context.only ? { only: [...context.only] } : {}),
    };
    return this.runRefactorTransaction("textDocument/codeAction", control, async (transaction) => {
      const raw = await transaction.rpc.sendRequest(
        "textDocument/codeAction",
        { textDocument: { uri: fileToUri(filePath) }, range, context: requestContext },
        control,
      );
      if (raw === null || raw === undefined) return null;
      if (!Array.isArray(raw)) throw new Error("LSP server returned malformed code actions.");

      return this.resolveCodeActions(raw, transaction, control, requestContext.only);
    });
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
  private async resolveCodeActions(
    raw: unknown[],
    transaction: RefactorTransaction,
    control: CodeRequestControl | undefined,
    only: readonly string[] | undefined,
  ): Promise<CodeAction[]> {
    const candidates = raw.map((value) => {
      const candidate = normalizeCodeActionResponseEntry(value);
      if (!candidate)
        throw new Error("LSP server returned a malformed code action response entry.");
      return candidate;
    });
    const actions: CodeAction[] = [];
    for (const action of candidates) {
      const lazyAction = isLazyCodeAction(action) ? action : undefined;
      if (
        !this.supportsCodeActionResolve ||
        !lazyAction ||
        (only !== undefined &&
          !only.some((filter) => codeActionKindMatchesFilter(lazyAction.kind, filter)))
      ) {
        actions.push(action);
        continue;
      }
      await transaction.assertCurrent();
      const resolved = await transaction.rpc.sendRequest("codeAction/resolve", lazyAction, control);
      await transaction.assertCurrent();
      if (!isRecord(resolved)) {
        throw new Error("LSP server returned a malformed resolved code action.");
      }
      const resolvedAction = normalizeCodeActionResponseEntry({ ...lazyAction, ...resolved });
      if (!resolvedAction) {
        throw new Error("LSP server returned a malformed resolved code action.");
      }
      actions.push(resolvedAction);
    }
    return actions;
  }

  private async runRefactorTransaction<T>(
    method: string,
    control: CodeRequestControl | undefined,
    operation: (transaction: RefactorTransaction) => Promise<T | null | undefined>,
  ): Promise<CodeQueryResult<T | null>> {
    throwIfCodeRequestInterrupted(control);
    if (!this.rpc || this._status !== "running") {
      return unavailableCodeQuery(
        `LSP request ${method} is unavailable because the client is not running.`,
      );
    }

    const retryGuard = new SemanticInputRequestRetryGuard((revision) =>
      this.diagnostics.getSemanticInputChangeSince(revision),
    );
    for (;;) {
      const attempt: SemanticRequestAttemptState = { inputRevision: undefined };
      try {
        retryGuard.assertCurrent();
        const data = await this.runRefactorTransactionAttempt({
          method,
          control,
          operation,
          retryGuard,
          attempt,
        });
        if (retryGuard.hasRetried) {
          this.recordSemanticRetry({ method, control, retryGuard, outcome: "completed" });
        }
        return completedCodeQuery(data);
      } catch (error) {
        const failure = this.handleRefactorTransactionFailure<T>({
          method,
          control,
          retryGuard,
          attempt,
          error,
        });
        if (failure) return failure;
      }
    }
  }

  private handleRefactorTransactionFailure<T>(options: {
    method: string;
    control?: CodeRequestControl;
    retryGuard: SemanticInputRequestRetryGuard;
    attempt: SemanticRequestAttemptState;
    error: unknown;
  }): CodeQueryResult<T | null> | null {
    const { method, control, retryGuard, attempt, error } = options;
    try {
      this.prepareSemanticRetry({ method, control, retryGuard, attempt, error });
      return null;
    } catch (retryError) {
      if (isCodeRequestInterruption(retryError, control)) throw retryError;
      const detail = retryError instanceof Error ? retryError.message : String(retryError);
      return unavailableCodeQuery(`LSP request ${method} failed: ${detail}`);
    }
  }

  /** Run the complete prepare/request/resolve transaction for one input snapshot. */
  private async runRefactorTransactionAttempt<T>(options: {
    method: string;
    control?: CodeRequestControl;
    operation: (transaction: RefactorTransaction) => Promise<T | null | undefined>;
    retryGuard: SemanticInputRequestRetryGuard;
    attempt: SemanticRequestAttemptState;
  }): Promise<T | null> {
    const { method, control, operation, retryGuard, attempt } = options;
    throwIfCodeRequestInterrupted(control);
    retryGuard.assertCurrent();
    await this.getReady(control);
    const inputSnapshot = await this.diagnostics.synchronizeSemanticInputs(control);
    attempt.inputRevision = inputSnapshot.revision;
    throwIfCodeRequestInterrupted(control);
    retryGuard.assertCurrent();
    const rpc = this.rpc;
    if (!rpc || this._status !== "running") {
      throw new Error(`LSP request ${method} is unavailable because the client is not running.`);
    }
    const data = await operation({
      rpc,
      assertCurrent: async () => {
        retryGuard.assertCurrent();
        await this.diagnostics.assertSemanticInputsCurrent(inputSnapshot, control);
      },
    });
    await this.diagnostics.assertSemanticInputsCurrent(inputSnapshot, control);
    return data ?? null;
  }

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
      return await this.queryWithEnrollmentRetry(method, params, control);
    } catch (error) {
      // Cancellation and absolute-deadline expiry propagate as interruptions:
      // the caller no longer awaits a result, so no unavailable outcome may
      // mask the cancellation.
      if (isCodeRequestInterruption(error, control)) throw error;
      const detail = error instanceof Error ? error.message : String(error);
      return unavailableCodeQuery(`LSP request ${method} failed: ${detail}`);
    }
  }

  private async queryWithEnrollmentRetry<T>(
    method: string,
    params: unknown,
    control?: CodeRequestControl,
  ): Promise<CodeQueryResult<T | null>> {
    const retryGuard = new SemanticInputRequestRetryGuard((revision) =>
      this.diagnostics.getSemanticInputChangeSince(revision),
    );
    for (;;) {
      const attempt: SemanticRequestAttemptState = { inputRevision: undefined };
      try {
        const data = await this.runSemanticRequestAttempt<T>({
          method,
          params,
          control,
          retryGuard,
          attempt,
        });
        if (retryGuard.hasRetried) {
          this.recordSemanticRetry({ method, control, retryGuard, outcome: "completed" });
        }
        return completedCodeQuery(data);
      } catch (error) {
        this.prepareSemanticRetry({ method, control, retryGuard, attempt, error });
      }
    }
  }

  /** Return only when another attempt is permitted; retain the cause when retry stops. */
  private prepareSemanticRetry(options: {
    method: string;
    control?: CodeRequestControl;
    retryGuard: SemanticInputRequestRetryGuard;
    attempt: SemanticRequestAttemptState;
    error: unknown;
  }): void {
    const { method, control, retryGuard, attempt, error } = options;
    if (isCodeRequestInterruption(error, control)) {
      if (retryGuard.hasRetried) {
        this.recordSemanticRetry({ method, control, retryGuard, outcome: "interrupted" });
      }
      throwIfCodeRequestInterrupted(control);
      throw error;
    }
    throwIfCodeRequestInterrupted(control);
    const decision = retryGuard.decide(error, attempt.inputRevision);
    if (decision.kind === "retry") {
      throwIfCodeRequestInterrupted(control);
      this.recordSemanticRetry({ method, control, retryGuard, outcome: "retry", error });
      return;
    }
    if (retryGuard.hasRetried) {
      const outcome = isSemanticInputEnrollmentError(decision.error) ? "exhausted" : "failed";
      this.recordSemanticRetry({ method, control, retryGuard, outcome, error: decision.error });
      const detail =
        decision.error instanceof Error ? decision.error.message : String(decision.error);
      const count = retryGuard.retryCount;
      throw new Error(
        `${detail} Enrollment retry ${outcome} after ${count} ${count === 1 ? "retry" : "retries"}.`,
        {
          cause: decision.error,
        },
      );
    }
    throw decision.error;
  }

  /** Record request acceptance separately from transport completion, without request content. */
  private recordSemanticRetry(options: {
    method: string;
    control?: CodeRequestControl;
    retryGuard: SemanticInputRequestRetryGuard;
    outcome: "retry" | "completed" | "exhausted" | "failed" | "interrupted";
    error?: unknown;
  }): void {
    recordDebugEvent({
      source: "lsp",
      level: "debug",
      category: "semantic-request.enrollment-retry",
      message: "LSP semantic request enrollment retry",
      cwd: boundCwd(this.cwd),
      ...(options.control?.operationId ? { operationId: options.control.operationId } : {}),
      data: {
        server: truncateIdentity(this.name),
        method: truncateIdentity(options.method),
        outcome: options.outcome,
        retryCount: options.retryGuard.retryCount,
        changeKind:
          options.error instanceof SemanticInputSynchronizationError
            ? options.error.changeKind
            : null,
      },
    });
  }

  private async runSemanticRequestAttempt<T>(options: {
    method: string;
    params: unknown;
    control?: CodeRequestControl;
    retryGuard: SemanticInputRequestRetryGuard;
    attempt: SemanticRequestAttemptState;
  }): Promise<T | null> {
    const { method, params, control, retryGuard, attempt } = options;
    throwIfCodeRequestInterrupted(control);
    retryGuard.assertCurrent();
    await this.getReady(control);
    const inputSnapshot = await this.diagnostics.synchronizeSemanticInputs(control);
    attempt.inputRevision = inputSnapshot.revision;
    throwIfCodeRequestInterrupted(control);
    retryGuard.assertCurrent();
    const rpc = this.rpc;
    if (!rpc || this._status !== "running") {
      throw new Error(`LSP request ${method} is unavailable because the client is not running.`);
    }
    const data = (await rpc.sendRequest(method, params, control)) as T | null | undefined;
    await this.diagnostics.assertSemanticInputsCurrent(inputSnapshot, control);
    return data ?? null;
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

  /** Run a server-requested refresh through the diagnostic-only path. */
  private refreshForServerRequest(): Promise<DiagnosticEvidenceSummary> {
    return this.diagnostics.refreshForServerRequest();
  }

  private handleServerDiagnosticRefreshRequest(): null {
    // Defer the pass before invoking it. Its setup can read and synchronize
    // genuinely changed tracked documents, so even an async method can delay
    // the null response on the JSON-RPC request stack.
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

  /** Send the initial settings snapshot after the initialize handshake. */
  private sendInitialConfigurationChange(): void {
    if (this.settingsSnapshot === undefined || !this.rpc || this._status !== "running") return;
    void this.rpc.sendNotification("workspace/didChangeConfiguration", {
      settings: this.settingsSnapshot,
    });
  }

  private buildWorkspaceConfigurationResult(params: unknown): unknown[] {
    if (!isRecord(params) || !Object.hasOwn(params, "items") || !Array.isArray(params.items)) {
      return [];
    }
    return params.items.map((item) => this.buildWorkspaceConfigurationItem(item));
  }

  private buildWorkspaceConfigurationItem(item: unknown): JsonValue | null {
    if (!isRecord(item)) return null;
    const scopeUri = Object.hasOwn(item, "scopeUri") ? item.scopeUri : undefined;
    if (!isApplicableConfigurationScope(scopeUri, this.root)) return null;
    const section = Object.hasOwn(item, "section") ? item.section : undefined;
    if (this.settingsSnapshot === undefined) {
      return section === undefined || section === "" ? EMPTY_SETTINGS : null;
    }
    return lookupSettings(this.settingsSnapshot, section) ?? null;
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
    const diagnosticRegistrations: Array<{
      id: string;
      options: Record<string, unknown>;
    }> = [];
    for (const registration of registrations) {
      if (registration.method !== DOCUMENT_DIAGNOSTIC_METHOD) continue;
      if (!isValidDiagnosticOptions(registration.registerOptions)) {
        throw new JsonRpcRequestError(
          -32602,
          "Malformed textDocument/diagnostic registration options.",
        );
      }
      diagnosticRegistrations.push({
        id: registration.id,
        options: registration.registerOptions as Record<string, unknown>,
      });
    }
    for (const registration of diagnosticRegistrations) {
      this.dynamicRegistrations.register(
        DOCUMENT_DIAGNOSTIC_METHOD,
        registration.id,
        registration.options,
      );
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
    const unregistrations: Array<{ id: string; method: string }> = [];
    for (const entry of params.unregisterations) {
      if (!isRecord(entry) || typeof entry.id !== "string" || typeof entry.method !== "string") {
        throw new JsonRpcRequestError(-32602, "Malformed client/unregisterCapability entry.");
      }
      unregistrations.push({ id: entry.id, method: entry.method });
    }
    for (const entry of unregistrations) {
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
    // If no progress timer was ever armed and no active tokens are tracked,
    // the server was either never started with a real process (test scenario)
    // or completed before any progress tracking began. Resolve immediately
    // only when the client is still running — a crash or shutdown clears
    // both fields but must not report the client as ready.
    if (this.noProgressTimer === null && !this.hasActiveTokens()) {
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
