// Shared session-scoped LSP service registry reused by peer extensions.

import {
  type CodeQueryResult,
  mapCodeQueryResult,
  unavailableCodeQuery,
} from "@mrclrchtr/supi-code-runtime/api";
import { createSessionStateRegistry } from "@mrclrchtr/supi-core/session";
import type {
  CodeAction,
  Diagnostic,
  DocumentSymbol,
  FileEvent,
  Hover,
  Location,
  LocationLink,
  Position,
  ProjectServerInfo,
  Range,
  SymbolInformation,
  WorkspaceEdit,
  WorkspaceSymbol,
} from "../config/types.ts";
import type { LspManager } from "../manager/manager.ts";
import { resolveSessionPath } from "../utils.ts";
import { raceReadinessValue } from "./readiness.ts";

function isRange(value: Position | Range): value is Range {
  return "start" in value && "end" in value;
}

function unavailableFileQuery<T>(operation: string, file: string): CodeQueryResult<T> {
  return unavailableCodeQuery(`No routed LSP client could complete ${operation} for ${file}.`);
}

/** Workspace diagnostic summary grouped by file. */
export interface WorkspaceDiagnosticSummaryEntry {
  file: string;
  errors: number;
  warnings: number;
}

/** Outstanding diagnostics grouped by file, including info and hint counts. */
export interface OutstandingDiagnosticSummaryEntry {
  file: string;
  total: number;
  errors: number;
  warnings: number;
  information: number;
  hints: number;
}

/** Result from a workspace diagnostic recovery pass. */
export interface RecoverDiagnosticsResult {
  /** Active clients targeted by the best-effort refresh, not confirmed successful refreshes. */
  attemptedClients: number;
  restartedClients: number;
  staleAssessment: {
    suspected: boolean;
    matchedFiles: Array<{ file: string; diagnostics: Diagnostic[] }>;
    warning: string | null;
  };
}

export type WorkspaceLspRuntimeState =
  | { kind: "ready"; runtime: WorkspaceLspRuntime }
  | { kind: "inactive"; runtime: WorkspaceLspRuntime }
  | { kind: "pending" }
  | { kind: "disabled" }
  | { kind: "unavailable"; reason: string };

export type SemanticReadinessResult =
  | { kind: "ready" }
  | { kind: "timeout" }
  | { kind: "unavailable"; reason: string };

/**
 * Workspace-scoped LSP interface that owns routing, readiness, semantic operations,
 * diagnostics, and recovery without exposing clients or the mutable manager.
 * File path inputs may be absolute or session-cwd-relative; a leading `@` is stripped
 * to match pi's built-in path-tool convention. Position arguments use raw 0-based LSP
 * coordinates; use `toLspPosition()` from `@mrclrchtr/supi-lsp/api` when starting from
 * user-facing 1-based line and character values.
 */
export interface WorkspaceLspRuntime {
  hover(filePath: string, position: Position): Promise<CodeQueryResult<Hover | null>>;
  definition(
    filePath: string,
    position: Position,
  ): Promise<CodeQueryResult<Location | Location[] | LocationLink[] | null>>;
  references(filePath: string, position: Position): Promise<CodeQueryResult<Location[]>>;
  implementation(
    filePath: string,
    position: Position,
  ): Promise<CodeQueryResult<Location | Location[] | LocationLink[] | null>>;
  documentSymbols(
    filePath: string,
  ): Promise<CodeQueryResult<DocumentSymbol[] | SymbolInformation[]>>;
  workspaceSymbol(query: string): Promise<CodeQueryResult<SymbolInformation[] | WorkspaceSymbol[]>>;
  rename(filePath: string, position: Position, newName: string): Promise<WorkspaceEdit | null>;
  codeActions(filePath: string, positionOrRange: Position | Range): Promise<CodeAction[] | null>;
  /** Succeeds only when the concrete routed client exists and is query-ready. */
  waitUntilReadyForFile(
    filePath: string,
    options?: { timeoutMs?: number },
  ): Promise<SemanticReadinessResult>;
  /** Succeeds only when at least one concrete workspace client is active and query-ready. */
  waitUntilReadyForWorkspace(options?: { timeoutMs?: number }): Promise<SemanticReadinessResult>;
  getProjectServers(): ProjectServerInfo[];
  isSupportedSourceFile(filePath: string): boolean;
  trackFile(filePath: string): Promise<boolean>;
  closeFile(filePath: string): void;
  pruneMissingFiles(): readonly string[];
  noteWorkspaceChanges(changes: FileEvent[]): void;
  fileDiagnostics(filePath: string, maxSeverity?: number): Promise<CodeQueryResult<Diagnostic[]>>;
  fileDiagnosticsWithCascade(
    filePath: string,
    maxSeverity?: number,
  ): Promise<CodeQueryResult<Array<{ file: string; diagnostics: Diagnostic[] }>>>;
  refreshOpenDiagnostics(options?: { maxWaitMs?: number; quietMs?: number }): Promise<void>;
  getWorkspaceDiagnosticSummary(): WorkspaceDiagnosticSummaryEntry[];
  getOutstandingDiagnostics(
    maxSeverity?: number,
  ): Array<{ file: string; diagnostics: Diagnostic[] }>;
  getOutstandingDiagnosticSummary(maxSeverity?: number): OutstandingDiagnosticSummaryEntry[];
  recoverDiagnostics(options?: {
    restartIfStillStale?: boolean;
    maxWaitMs?: number;
    quietMs?: number;
  }): Promise<RecoverDiagnosticsResult>;
}

class DefaultWorkspaceLspRuntime implements WorkspaceLspRuntime {
  constructor(private readonly manager: LspManager) {}

  static createOwner(manager: LspManager) {
    const runtime = new DefaultWorkspaceLspRuntime(manager);
    return { runtime: runtime as WorkspaceLspRuntime, shutdown: () => runtime.#shutdown() };
  }

  // ── Semantic lookups ────────────────────────────────────────────────

  async hover(filePath: string, position: Position): Promise<CodeQueryResult<Hover | null>> {
    const resolvedPath = this.resolveFilePath(filePath);
    const client = await this.manager.ensureFileOpen(resolvedPath);
    if (!client) return unavailableFileQuery("hover", resolvedPath);
    return client.hover(resolvedPath, position);
  }

  async definition(
    filePath: string,
    position: Position,
  ): Promise<CodeQueryResult<Location | Location[] | LocationLink[] | null>> {
    const resolvedPath = this.resolveFilePath(filePath);
    const client = await this.manager.ensureFileOpen(resolvedPath);
    if (!client) return unavailableFileQuery("definition", resolvedPath);
    return client.definition(resolvedPath, position);
  }

  async references(filePath: string, position: Position): Promise<CodeQueryResult<Location[]>> {
    const resolvedPath = this.resolveFilePath(filePath);
    const client = await this.manager.ensureFileOpen(resolvedPath);
    if (!client) return unavailableFileQuery("references", resolvedPath);
    return mapCodeQueryResult(
      await client.references(resolvedPath, position),
      (data) => data ?? [],
    );
  }

  async implementation(
    filePath: string,
    position: Position,
  ): Promise<CodeQueryResult<Location | Location[] | LocationLink[] | null>> {
    const resolvedPath = this.resolveFilePath(filePath);
    const client = await this.manager.ensureFileOpen(resolvedPath);
    if (!client) return unavailableFileQuery("implementation", resolvedPath);
    return client.implementation(resolvedPath, position);
  }

  async documentSymbols(
    filePath: string,
  ): Promise<CodeQueryResult<DocumentSymbol[] | SymbolInformation[]>> {
    const resolvedPath = this.resolveFilePath(filePath);
    const client = await this.manager.ensureFileOpen(resolvedPath);
    if (!client) return unavailableFileQuery("document symbols", resolvedPath);
    return mapCodeQueryResult(await client.documentSymbols(resolvedPath), (data) => data ?? []);
  }

  async workspaceSymbol(
    query: string,
  ): Promise<CodeQueryResult<SymbolInformation[] | WorkspaceSymbol[]>> {
    return this.manager.workspaceSymbol(query);
  }

  async rename(
    filePath: string,
    position: Position,
    newName: string,
  ): Promise<WorkspaceEdit | null> {
    const resolvedPath = this.resolveFilePath(filePath);
    const client = await this.manager.ensureFileOpen(resolvedPath);
    if (!client) return null;
    return client.rename(resolvedPath, position, newName);
  }

  async codeActions(
    filePath: string,
    positionOrRange: Position | Range,
  ): Promise<CodeAction[] | null> {
    const resolvedPath = this.resolveFilePath(filePath);
    const client = await this.manager.ensureFileOpen(resolvedPath);
    if (!client) return null;

    const range = isRange(positionOrRange)
      ? positionOrRange
      : { start: positionOrRange, end: positionOrRange };
    const diagnostics = client
      .getDiagnostics(resolvedPath)
      .filter((diagnostic) => diagnostic.range.end.line >= range.start.line)
      .filter((diagnostic) => diagnostic.range.start.line <= range.end.line);

    return client.codeActions(resolvedPath, range, { diagnostics });
  }

  /**
   * Wait until the LSP client that owns a file is ready for semantic queries.
   * Performs a lightweight semantic warm-up probe before resolving.
   */
  async waitUntilReadyForFile(
    filePath: string,
    options: { timeoutMs?: number } = {},
  ): Promise<SemanticReadinessResult> {
    const resolvedPath = this.resolveFilePath(filePath);
    if (!this.manager.canServeFile(resolvedPath)) {
      return {
        kind: "unavailable",
        reason: "No LSP client can serve this file",
      };
    }

    const readiness = await raceReadinessValue(
      this.manager.waitUntilFileReady(resolvedPath),
      options.timeoutMs,
    );
    if (readiness.kind !== "resolved") return readiness;
    if (readiness.value === null) {
      return {
        kind: "unavailable",
        reason: "The routed LSP client could not be started for this file",
      };
    }
    return { kind: "ready" };
  }

  /**
   * Wait until all started LSP clients are ready for semantic queries.
   * Performs one representative warm-up probe per client/root.
   */
  async waitUntilReadyForWorkspace(
    options: { timeoutMs?: number } = {},
  ): Promise<SemanticReadinessResult> {
    const readiness = await raceReadinessValue(
      this.manager.waitUntilWorkspaceReady(),
      options.timeoutMs,
    );
    if (readiness.kind !== "resolved") return readiness;
    if (readiness.value === 0) {
      return {
        kind: "unavailable",
        reason: "No active LSP clients are ready for this workspace",
      };
    }
    return { kind: "ready" };
  }

  getProjectServers(): ProjectServerInfo[] {
    return this.manager.getKnownProjectServers([]);
  }

  /** Check whether the file can be served semantically for explicit LSP operations. */
  isSupportedSourceFile(filePath: string): boolean {
    return this.manager.canServeFile(this.resolveFilePath(filePath));
  }

  /** Track a file in its routed client without exposing that client. */
  async trackFile(filePath: string): Promise<boolean> {
    const resolvedPath = this.resolveFilePath(filePath);
    return (await this.manager.ensureFileOpen(resolvedPath)) !== null;
  }

  /** Stop tracking a file and clear its cached diagnostics. */
  closeFile(filePath: string): void {
    this.manager.closeFile(this.resolveFilePath(filePath));
  }

  /** Remove missing files from runtime tracking. */
  pruneMissingFiles(): readonly string[] {
    return this.manager.pruneMissingFiles();
  }

  /** Notify routed clients of workspace file changes and reset pull state. */
  noteWorkspaceChanges(changes: FileEvent[]): void {
    this.manager.clearAllPullResultIds();
    this.manager.notifyWorkspaceFileChanges(changes);
  }

  async #shutdown(): Promise<void> {
    await this.manager.shutdownAll();
  }

  // ── Diagnostics and recovery ────────────────────────────────────────

  /** Sync a file through LSP and return diagnostics up to the supplied severity threshold. */
  async fileDiagnostics(
    filePath: string,
    maxSeverity: number = 4,
  ): Promise<CodeQueryResult<Diagnostic[]>> {
    const resolvedPath = this.resolveFilePath(filePath);
    if (!this.manager.canServeFile(resolvedPath)) {
      return unavailableFileQuery("diagnostics", resolvedPath);
    }
    return this.manager.syncFileAndGetDiagnostics(resolvedPath, maxSeverity);
  }

  /** Sync a file and include diagnostics cascading into other tracked files. */
  async fileDiagnosticsWithCascade(
    filePath: string,
    maxSeverity: number = 4,
  ): Promise<CodeQueryResult<Array<{ file: string; diagnostics: Diagnostic[] }>>> {
    return this.manager.syncFileAndGetCascadingDiagnostics(
      this.resolveFilePath(filePath),
      maxSeverity,
    );
  }

  /** Re-sync every open document and wait for diagnostics to settle. */
  async refreshOpenDiagnostics(options?: { maxWaitMs?: number; quietMs?: number }): Promise<void> {
    await this.manager.refreshOpenDiagnostics(options);
  }

  /** Get a lightweight workspace diagnostic summary for all tracked files. */
  getWorkspaceDiagnosticSummary(): WorkspaceDiagnosticSummaryEntry[] {
    return this.manager.getDiagnosticSummary();
  }

  /** Get outstanding diagnostics grouped by file at or above the supplied severity threshold. */
  getOutstandingDiagnostics(
    maxSeverity: number = 1,
  ): Array<{ file: string; diagnostics: Diagnostic[] }> {
    return this.manager.getOutstandingDiagnostics(maxSeverity);
  }

  /** Get outstanding diagnostic counts grouped by file. */
  getOutstandingDiagnosticSummary(maxSeverity: number = 1): OutstandingDiagnosticSummaryEntry[] {
    return this.manager.getOutstandingDiagnosticSummary(maxSeverity);
  }

  /** Trigger a workspace-wide diagnostics refresh and stale-state recovery pass. */
  async recoverDiagnostics(options?: {
    restartIfStillStale?: boolean;
    maxWaitMs?: number;
    quietMs?: number;
  }): Promise<RecoverDiagnosticsResult> {
    return this.manager.recoverWorkspaceDiagnostics(options);
  }

  private resolveFilePath(filePath: string): string {
    return resolveSessionPath(this.manager.getCwd(), filePath);
  }
}

export function createWorkspaceLspRuntimeOwner(manager: LspManager) {
  return DefaultWorkspaceLspRuntime.createOwner(manager);
}

const WAIT_INTERVAL_MS = 25;
const registry = createSessionStateRegistry<WorkspaceLspRuntimeState>("supi-lsp/session-registry");

/** Publish the LSP service state for a session cwd. */
export function setWorkspaceLspRuntimeState(cwd: string, state: WorkspaceLspRuntimeState): void {
  registry.set(cwd, state);
}

/** Acquire the LSP service state for a session cwd. */
export function getWorkspaceLspRuntime(cwd: string): WorkspaceLspRuntimeState {
  return (
    registry.get(cwd) ?? {
      kind: "unavailable",
      reason: "No LSP session initialized for this workspace",
    }
  );
}

/** Wait briefly for a pending session-scoped LSP service to become ready. */
export async function waitForWorkspaceLspRuntime(
  cwd: string,
  timeoutMs: number = 250,
): Promise<WorkspaceLspRuntimeState> {
  const deadline = Date.now() + Math.max(0, timeoutMs);
  let state = getWorkspaceLspRuntime(cwd);

  while (state.kind === "pending" && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, WAIT_INTERVAL_MS));
    state = getWorkspaceLspRuntime(cwd);
  }

  return state;
}

/** Remove the LSP service state for a session cwd. */
export function clearWorkspaceLspRuntime(cwd: string): void {
  registry.clear(cwd);
}
