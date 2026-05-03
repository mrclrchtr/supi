// Shared session-scoped LSP service registry.
// Peer extensions can import `getSessionLspService` from the package root
// to reuse the active LSP runtime without starting duplicate servers.

import * as path from "node:path";
import type { LspManager } from "./manager.ts";
import type {
  Diagnostic,
  DocumentSymbol,
  Hover,
  Location,
  LocationLink,
  Position,
  ProjectServerInfo,
  SymbolInformation,
  WorkspaceSymbol,
} from "./types.ts";

export type SessionLspServiceState =
  | { kind: "ready"; service: SessionLspService }
  | { kind: "pending" }
  | { kind: "disabled" }
  | { kind: "unavailable"; reason: string };

/**
 * Public wrapper around {@link LspManager} that exposes stable semantic operations.
 * File path inputs may be absolute or session-cwd-relative; a leading `@` is stripped
 * to match pi's built-in path-tool convention.
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

  // ── Project / runtime awareness ─────────────────────────────────────

  getProjectServers(): ProjectServerInfo[] {
    return this.manager.getKnownProjectServers([]);
  }

  isSupportedSourceFile(filePath: string): boolean {
    return this.manager.isSupportedSourceFile(this.resolveFilePath(filePath));
  }

  // ── Diagnostics ─────────────────────────────────────────────────────

  getOutstandingDiagnostics(
    maxSeverity: number = 1,
  ): Array<{ file: string; diagnostics: Diagnostic[] }> {
    return this.manager.getOutstandingDiagnostics(maxSeverity);
  }

  getOutstandingDiagnosticSummary(
    maxSeverity: number = 1,
  ): import("./manager-types.ts").OutstandingDiagnosticSummaryEntry[] {
    return this.manager.getOutstandingDiagnosticSummary(maxSeverity);
  }

  /** Access the underlying manager for advanced use cases (discouraged). */
  getManager(): LspManager {
    return this.manager;
  }

  private resolveFilePath(filePath: string): string {
    const normalizedPath = filePath.startsWith("@") ? filePath.slice(1) : filePath;
    return path.resolve(this.manager.getCwd(), normalizedPath);
  }
}

// ── Registry ──────────────────────────────────────────────────────────

const REGISTRY_KEY = Symbol.for("@mrclrchtr/supi-lsp/session-registry");

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

/** Remove the LSP service state for a session cwd. */
export function clearSessionLspService(cwd: string): void {
  registry.delete(normalizeCwd(cwd));
}
