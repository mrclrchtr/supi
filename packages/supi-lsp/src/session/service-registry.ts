// Shared session-scoped LSP service registry.
// Peer extensions can import `getSessionLspService` from the package root
// to reuse the active LSP runtime without starting duplicate servers.

import * as path from "node:path";
import type {
  CodeAction,
  Diagnostic,
  DocumentSymbol,
  Hover,
  Location,
  LocationLink,
  Position,
  ProjectServerInfo,
  SymbolInformation,
  WorkspaceEdit,
  WorkspaceSymbol,
} from "../config/types.ts";
import type { LspManager } from "../manager/manager.ts";

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
  refreshedClients: number;
  restartedClients: number;
  staleAssessment: {
    suspected: boolean;
    matchedFiles: Array<{ file: string; diagnostics: Diagnostic[] }>;
    warning: string | null;
  };
}

export type SessionLspServiceState =
  | { kind: "ready"; service: SessionLspService }
  | { kind: "inactive"; service: SessionLspService }
  | { kind: "pending" }
  | { kind: "disabled" }
  | { kind: "unavailable"; reason: string };

/**
 * Public wrapper around {@link LspManager} that exposes stable semantic operations.
 * File path inputs may be absolute or session-cwd-relative; a leading `@` is stripped
 * to match pi's built-in path-tool convention. Position arguments use raw 0-based LSP
 * coordinates; use `toLspPosition()` from `@mrclrchtr/supi-lsp/api` when starting from
 * user-facing 1-based line and character values.
 */
export class SessionLspService {
  constructor(private readonly manager: LspManager) {}

  // ── Semantic lookups ────────────────────────────────────────────────

  async hover(filePath: string, position: Position): Promise<Hover | null> {
    const resolvedPath = this.resolveFilePath(filePath);
    const client = await this.manager.ensureFileOpen(resolvedPath);
    if (!client) return null;
    return client.hover(resolvedPath, position);
  }

  async definition(
    filePath: string,
    position: Position,
  ): Promise<Location | Location[] | LocationLink[] | null> {
    const resolvedPath = this.resolveFilePath(filePath);
    const client = await this.manager.ensureFileOpen(resolvedPath);
    if (!client) return null;
    return client.definition(resolvedPath, position);
  }

  async references(filePath: string, position: Position): Promise<Location[] | null> {
    const resolvedPath = this.resolveFilePath(filePath);
    const client = await this.manager.ensureFileOpen(resolvedPath);
    if (!client) return null;
    return client.references(resolvedPath, position);
  }

  async implementation(
    filePath: string,
    position: Position,
  ): Promise<Location | Location[] | LocationLink[] | null> {
    const resolvedPath = this.resolveFilePath(filePath);
    const client = await this.manager.ensureFileOpen(resolvedPath);
    if (!client) return null;
    return client.implementation(resolvedPath, position);
  }

  async documentSymbols(filePath: string): Promise<DocumentSymbol[] | SymbolInformation[] | null> {
    const resolvedPath = this.resolveFilePath(filePath);
    const client = await this.manager.ensureFileOpen(resolvedPath);
    if (!client) return null;
    return client.documentSymbols(resolvedPath);
  }

  async workspaceSymbol(query: string): Promise<SymbolInformation[] | WorkspaceSymbol[] | null> {
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

  async codeActions(filePath: string, position: Position): Promise<CodeAction[] | null> {
    const resolvedPath = this.resolveFilePath(filePath);
    const client = await this.manager.ensureFileOpen(resolvedPath);
    if (!client) return null;

    const range = { start: position, end: position };
    const diagnostics = client
      .getDiagnostics(resolvedPath)
      .filter((diagnostic) => diagnostic.range.start.line <= position.line)
      .filter((diagnostic) => diagnostic.range.end.line >= position.line);

    return client.codeActions(resolvedPath, range, { diagnostics });
  }

  // ── Project / runtime awareness ─────────────────────────────────────

  getProjectServers(): ProjectServerInfo[] {
    return this.manager.getKnownProjectServers([]);
  }

  /** Check whether the file can be served semantically for explicit LSP operations. */
  isSupportedSourceFile(filePath: string): boolean {
    return this.manager.canServeFile(this.resolveFilePath(filePath));
  }

  // ── Diagnostics ─────────────────────────────────────────────────────

  /** Sync a file through LSP and return diagnostics up to the supplied severity threshold. */
  async fileDiagnostics(filePath: string, maxSeverity: number = 4): Promise<Diagnostic[] | null> {
    const resolvedPath = this.resolveFilePath(filePath);
    if (!this.manager.canServeFile(resolvedPath)) return null;
    return this.manager.syncFileAndGetDiagnostics(resolvedPath, maxSeverity);
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
    const normalizedPath = filePath.startsWith("@") ? filePath.slice(1) : filePath;
    return path.resolve(this.manager.getCwd(), normalizedPath);
  }
}

// ── Registry ──────────────────────────────────────────────────────────

const REGISTRY_KEY = Symbol.for("@mrclrchtr/supi-lsp/session-registry");
const WAIT_INTERVAL_MS = 25;

function getRegistry(): Map<string, SessionLspServiceState> {
  const globalScope = globalThis as typeof globalThis & Record<symbol, unknown>;
  const existing = globalScope[REGISTRY_KEY];
  if (existing instanceof Map) return existing as Map<string, SessionLspServiceState>;

  const registry = new Map<string, SessionLspServiceState>();
  globalScope[REGISTRY_KEY] = registry;
  return registry;
}

function normalizeCwd(cwd: string): string {
  return path.resolve(cwd);
}

const registry = getRegistry();

/** Publish the LSP service state for a session cwd. */
export function setSessionLspServiceState(cwd: string, state: SessionLspServiceState): void {
  registry.set(normalizeCwd(cwd), state);
}

/** Acquire the LSP service state for a session cwd. */
export function getSessionLspService(cwd: string): SessionLspServiceState {
  return (
    registry.get(normalizeCwd(cwd)) ?? {
      kind: "unavailable",
      reason: "No LSP session initialized for this workspace",
    }
  );
}

/** Wait briefly for a pending session-scoped LSP service to become ready. */
export async function waitForSessionLspService(
  cwd: string,
  timeoutMs: number = 250,
): Promise<SessionLspServiceState> {
  const deadline = Date.now() + Math.max(0, timeoutMs);
  let state = getSessionLspService(cwd);

  while (state.kind === "pending" && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, WAIT_INTERVAL_MS));
    state = getSessionLspService(cwd);
  }

  return state;
}

/** Remove the LSP service state for a session cwd. */
export function clearSessionLspService(cwd: string): void {
  registry.delete(normalizeCwd(cwd));
}
