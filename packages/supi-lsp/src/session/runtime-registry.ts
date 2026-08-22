// Shared session-scoped LSP service registry reused by peer extensions.

// biome-ignore lint/style/noExcessiveLinesPerFile: session registry, runtime recovery, and telemetry stay in one file; splitting would hide the recovery contract.
import {
  type CodeQueryResult,
  type CodeRequestControl,
  isCodeRequestInterruption,
  mapCodeQueryResult,
  throwIfCodeRequestInterrupted,
  unavailableCodeQuery,
} from "@mrclrchtr/supi-code-runtime/api";
import { recordDebugEvent } from "@mrclrchtr/supi-core/debug";
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
import { boundServerNames, truncateIdentity } from "../debug-telemetry.ts";
import type { LspManager } from "../manager/manager.ts";
import { resolveSessionPath } from "../utils.ts";
import { raceReadinessValue } from "./readiness.ts";
import type { DiagnosticEvidenceSummary, RecoverDiagnosticsResult } from "./runtime-diagnostics.ts";
import type {
  RoutedMutationResponse,
  SemanticReadinessResult,
  WorkspaceLspRuntime,
  WorkspaceLspRuntimeState,
} from "./workspace-lsp-runtime.ts";

export type { WorkspaceLspDiagnosticSurface } from "./runtime-diagnostic-surface.ts";
export type {
  DiagnosticEvidenceDocument,
  DiagnosticEvidenceStatus,
  DiagnosticEvidenceSummary,
  OutstandingDiagnosticSummaryEntry,
  RecoverDiagnosticsResult,
  WorkspaceDiagnosticReport,
  WorkspaceDiagnosticSnapshot,
  WorkspaceDiagnosticSummaryEntry,
} from "./runtime-diagnostics.ts";
export type {
  RoutedMutationResponse,
  SemanticReadinessResult,
  WorkspaceLspRuntime,
  WorkspaceLspRuntimeState,
} from "./workspace-lsp-runtime.ts";

function isRange(value: Position | Range): value is Range {
  return "start" in value && "end" in value;
}

function unavailableFileQuery<T>(operation: string, file: string): CodeQueryResult<T> {
  return unavailableCodeQuery(`No routed LSP client could complete ${operation} for ${file}.`);
}

/** Emit one aggregate tsconfig scope-decision event after a recovery pass. */
function recordScopeDecisionEvent(manager: LspManager): void {
  try {
    const summary = manager.getScopeDecisionSummary();
    recordDebugEvent({
      source: "lsp",
      level: "debug",
      category: "diagnostics.scope",
      message: "LSP diagnostic tsconfig scope decisions",
      cwd: truncateIdentity(manager.getCwd()),
      data: {
        caseSensitiveFileNames: summary.caseSensitiveFileNames,
        counts: summary.counts,
        basisCounts: summary.basisCounts,
        totalFiles: summary.totalFiles,
        entries: summary.entries.map((entry) => ({
          file: truncateIdentity(entry.file),
          status: entry.status,
          ...(entry.basis ? { basis: entry.basis } : {}),
        })),
      },
    });
  } catch {
    // Telemetry must never turn a completed recovery into a failure.
  }
}

class DefaultWorkspaceLspRuntime implements WorkspaceLspRuntime {
  constructor(private readonly manager: LspManager) {}

  static createOwner(manager: LspManager) {
    const runtime = new DefaultWorkspaceLspRuntime(manager);
    return { runtime: runtime as WorkspaceLspRuntime, shutdown: () => runtime.#shutdown() };
  }

  // ── Semantic lookups ────────────────────────────────────────────────

  async hover(
    filePath: string,
    position: Position,
    control?: CodeRequestControl,
  ): Promise<CodeQueryResult<Hover | null>> {
    const resolvedPath = this.resolveFilePath(filePath);
    const client = await this.manager.ensureFileOpen(resolvedPath);
    if (!client) return unavailableFileQuery("hover", resolvedPath);
    return client.hover(resolvedPath, position, control);
  }

  async definition(
    filePath: string,
    position: Position,
    control?: CodeRequestControl,
  ): Promise<CodeQueryResult<Location | Location[] | LocationLink[] | null>> {
    const resolvedPath = this.resolveFilePath(filePath);
    const client = await this.manager.ensureFileOpen(resolvedPath);
    if (!client) return unavailableFileQuery("definition", resolvedPath);
    return client.definition(resolvedPath, position, control);
  }

  async references(
    filePath: string,
    position: Position,
    control?: CodeRequestControl,
  ): Promise<CodeQueryResult<Location[]>> {
    const resolvedPath = this.resolveFilePath(filePath);
    const client = await this.manager.ensureFileOpen(resolvedPath);
    if (!client) return unavailableFileQuery("references", resolvedPath);
    return mapCodeQueryResult(
      await client.references(resolvedPath, position, control),
      (data) => data ?? [],
    );
  }

  async implementation(
    filePath: string,
    position: Position,
    control?: CodeRequestControl,
  ): Promise<CodeQueryResult<Location | Location[] | LocationLink[] | null>> {
    const resolvedPath = this.resolveFilePath(filePath);
    const client = await this.manager.ensureFileOpen(resolvedPath);
    if (!client) return unavailableFileQuery("implementation", resolvedPath);
    return client.implementation(resolvedPath, position, control);
  }

  async documentSymbols(
    filePath: string,
    control?: CodeRequestControl,
  ): Promise<CodeQueryResult<DocumentSymbol[] | SymbolInformation[]>> {
    const resolvedPath = this.resolveFilePath(filePath);
    const client = await this.manager.ensureFileOpen(resolvedPath);
    if (!client) return unavailableFileQuery("document symbols", resolvedPath);
    return mapCodeQueryResult(
      await client.documentSymbols(resolvedPath, control),
      (data) => data ?? [],
    );
  }

  async workspaceSymbol(
    query: string,
    control?: CodeRequestControl,
  ): Promise<CodeQueryResult<SymbolInformation[] | WorkspaceSymbol[]>> {
    return this.manager.workspaceSymbol(query, control);
  }

  async rename(
    filePath: string,
    position: Position,
    newName: string,
    control?: CodeRequestControl,
  ): Promise<RoutedMutationResponse<WorkspaceEdit | null> | null> {
    const resolvedPath = this.resolveFilePath(filePath);
    const client = await this.manager.ensureFileOpen(resolvedPath);
    if (!client) return null;
    return {
      value: await client.rename(resolvedPath, position, newName, control),
      authorizedMutationRoots: [client.root],
    };
  }

  getOpenDocumentVersion(filePath: string): number | null {
    return this.manager.getOpenDocumentVersion(this.resolveFilePath(filePath));
  }

  async codeActions(
    filePath: string,
    positionOrRange: Position | Range,
    control?: CodeRequestControl,
  ): Promise<RoutedMutationResponse<CodeAction[] | null> | null> {
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

    return {
      value: await client.codeActions(resolvedPath, range, { diagnostics }, control),
      authorizedMutationRoots: [client.root],
    };
  }

  /**
   * Wait until the LSP client that owns a file is ready for semantic queries.
   * Performs a lightweight semantic warm-up probe before resolving.
   */
  async waitUntilReadyForFile(
    filePath: string,
    options: { timeoutMs?: number } = {},
    control?: CodeRequestControl,
  ): Promise<SemanticReadinessResult> {
    const resolvedPath = this.resolveFilePath(filePath);
    if (!this.manager.canServeFile(resolvedPath)) {
      return {
        kind: "unavailable",
        reason: "No LSP client can serve this file",
      };
    }

    const readiness = await raceReadinessValue(
      this.manager.waitUntilFileReady(resolvedPath, control),
      options.timeoutMs,
      control,
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
    control?: CodeRequestControl,
  ): Promise<SemanticReadinessResult> {
    const readiness = await raceReadinessValue(
      this.manager.waitUntilWorkspaceReady(control),
      options.timeoutMs,
      control,
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
    this.manager.noteWorkspaceChanges(changes);
  }

  async #shutdown(): Promise<void> {
    await this.manager.shutdownAll();
  }

  // ── Diagnostics and recovery ────────────────────────────────────────

  /** Sync a file through LSP and return diagnostics up to the supplied severity threshold. */
  async fileDiagnostics(
    filePath: string,
    maxSeverity: number = 4,
    control?: CodeRequestControl,
  ): Promise<CodeQueryResult<Diagnostic[]>> {
    const resolvedPath = this.resolveFilePath(filePath);
    if (!this.manager.canServeFile(resolvedPath)) {
      return unavailableFileQuery("diagnostics", resolvedPath);
    }
    return this.manager.syncFileAndGetDiagnostics(resolvedPath, maxSeverity, control);
  }

  /** Re-sync every open document and wait for diagnostics to settle. */
  async refreshOpenDiagnostics(
    options?: { maxWaitMs?: number; quietMs?: number },
    control?: CodeRequestControl,
  ): Promise<DiagnosticEvidenceSummary> {
    return this.manager.refreshOpenDiagnostics({ ...options, ...control });
  }

  /** Get a lightweight workspace diagnostic summary for all tracked files. */
  getWorkspaceDiagnosticSummary() {
    return this.manager.getDiagnosticSnapshot();
  }

  /** Get outstanding diagnostics grouped by file at or above the supplied severity threshold. */
  getOutstandingDiagnostics(maxSeverity: number = 1) {
    return this.manager.getOutstandingDiagnosticsSnapshot(maxSeverity);
  }

  /** Get outstanding diagnostic counts grouped by file. */
  getOutstandingDiagnosticSummary(maxSeverity: number = 1) {
    return this.manager.getOutstandingDiagnosticSummarySnapshot(maxSeverity);
  }

  /** Trigger a workspace-wide diagnostics refresh and stale-state recovery pass. */
  async recoverDiagnostics(options?: {
    restartIfStillStale?: boolean;
    maxWaitMs?: number;
    quietMs?: number;
    /** Evidence from a refresh the caller already completed; skips this pass's own refresh when no watched-file changes apply. */
    initialEvidence?: DiagnosticEvidenceSummary;
    control?: CodeRequestControl;
  }): Promise<RecoverDiagnosticsResult> {
    const recoveryStartedAt = Date.now();
    try {
      const result = await this.manager.recoverWorkspaceDiagnostics(options);
      const outcome = result.refreshFailureReason ? "failed" : "completed";
      recordDebugEvent({
        source: "lsp",
        level: "debug",
        category: "runtime.recovery",
        message: `LSP diagnostic recovery ${outcome}`,
        cwd: truncateIdentity(this.manager.getCwd()),
        data: {
          outcome,
          elapsedMs: result.elapsedMs,
          attemptedClients: result.attemptedClients,
          restartedClients: result.restartedClients,
          attemptedServers: boundServerNames(result.attemptedServers ?? []),
          restartedServers: boundServerNames(result.restartedServers ?? []),
          ...(result.restartReason ? { reason: result.restartReason } : {}),
        },
      });
      recordScopeDecisionEvent(this.manager);
      return result;
    } catch (error) {
      // A cancelled pass has no result object, so telemetry records the
      // cancelled outcome, the elapsed time, and the server names that are
      // still running at cancellation. Restart identity is unavailable
      // because the pass produced no result.
      if (isCodeRequestInterruption(error, options?.control)) {
        recordDebugEvent({
          source: "lsp",
          level: "debug",
          category: "runtime.recovery",
          message: "LSP diagnostic recovery cancelled",
          cwd: truncateIdentity(this.manager.getCwd()),
          data: {
            outcome: "cancelled",
            elapsedMs: Date.now() - recoveryStartedAt,
            attemptedServers: boundServerNames(this.manager.getRunningClientNames()),
          },
        });
      }
      throw error;
    }
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
  control?: CodeRequestControl,
): Promise<WorkspaceLspRuntimeState> {
  const deadline = Date.now() + Math.max(0, timeoutMs);
  let state = getWorkspaceLspRuntime(cwd);

  while (state.kind === "pending" && Date.now() < deadline) {
    throwIfCodeRequestInterrupted(control);
    await new Promise((resolve) => setTimeout(resolve, WAIT_INTERVAL_MS));
    state = getWorkspaceLspRuntime(cwd);
  }

  // A cancelled poll must not hand a runtime to a caller that no longer awaits.
  throwIfCodeRequestInterrupted(control);
  return state;
}

/** Remove the LSP service state for a session cwd. */
export function clearWorkspaceLspRuntime(cwd: string): void {
  registry.clear(cwd);
}
