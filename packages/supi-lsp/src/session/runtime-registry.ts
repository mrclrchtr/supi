// Shared session-scoped LSP service registry reused by peer extensions.

// biome-ignore lint/style/noExcessiveLinesPerFile: session registry, runtime recovery, and telemetry stay in one file; splitting would hide the recovery contract.
import { fileURLToPath } from "node:url";
import {
  type CodeQueryResult,
  type CodeRequestControl,
  isCodeRequestInterruption,
  mapCodeQueryResult,
  partialCodeQuery,
  throwIfCodeRequestInterrupted,
  unavailableCodeQuery,
} from "@mrclrchtr/supi-code-runtime/api";
import {
  recordDebugEvent,
  truncateDebugIdentity as truncateIdentity,
} from "@mrclrchtr/supi-core/debug";
import { resolveToolPath as resolveSessionPath } from "@mrclrchtr/supi-core/path";
import { createSessionStateRegistry } from "@mrclrchtr/supi-core/session";
import { CodeActionTriggerKind } from "vscode-languageserver-types";
import type { CommandEditCaptureResult } from "../client/client-edit-capture.ts";
import { advertisedCodeActionKinds } from "../config/operation-support.ts";
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
import { boundServerNames } from "../debug-telemetry.ts";
import type {
  WorkspaceSentinelScanOptions,
  WorkspaceSentinelSyncResult,
} from "../diagnostics/workspace-sentinels.ts";
import type { LspManager } from "../manager/manager.ts";
import {
  COMMAND_ONLY_ACTION_REASON,
  captureEligibleActions,
} from "../provider/refactor-command-capture.ts";
import { raceReadinessValue } from "./readiness.ts";
import { outsideRouteRootReason } from "./route-boundary.ts";
import type {
  DiagnosticEvidenceSummary,
  ProcessCrashRecoveryReport,
  RecoverDiagnosticsResult,
  StartupRetryReport,
} from "./runtime-diagnostics.ts";
import { runRoutedRename } from "./runtime-rename.ts";
import type {
  BulkTrackFilesResult,
  RoutedCodeActionResponse,
  RoutedMutationResponse,
  SemanticReadinessResult,
  WorkspaceCodeActionRequestOptions,
  WorkspaceLspRuntime,
  WorkspaceLspRuntimeState,
} from "./workspace-lsp-runtime.ts";

/** Upper bound for a server command run to capture its pushed edit. */
const COMMAND_CAPTURE_TIMEOUT_MS = 10_000;

export type {
  ProcessCrashDiagnosticDemand,
  WorkspaceLspDiagnosticSurface,
} from "./runtime-diagnostic-surface.ts";
export {
  type DiagnosticEvidenceDocument,
  type DiagnosticEvidenceStatus,
  type DiagnosticEvidenceSummary,
  emptyProcessCrashRecoveryReport,
  emptyStartupRetryReport,
  MAX_PROCESS_CRASH_RECOVERY_ENTRIES,
  type OutstandingDiagnosticSummaryEntry,
  type ProcessCrashRecoveryEntry,
  type ProcessCrashRecoveryNextAction,
  type ProcessCrashRecoveryOutcome,
  type ProcessCrashRecoveryReport,
  type RecoverDiagnosticsResult,
  type StartupRetryEntry,
  type StartupRetryNextAction,
  type StartupRetryOutcome,
  type StartupRetryReport,
  type WorkspaceDiagnosticReport,
  type WorkspaceDiagnosticSnapshot,
  type WorkspaceDiagnosticSummaryEntry,
} from "./runtime-diagnostics.ts";
export type {
  BulkTrackFileOutcome,
  BulkTrackFilesResult,
  RoutedCodeActionResponse,
  RoutedMutationDocumentSnapshot,
  RoutedMutationResponse,
  SemanticReadinessResult,
  WorkspaceCodeActionRequestOptions,
  WorkspaceLspRuntime,
  WorkspaceLspRuntimeState,
} from "./workspace-lsp-runtime.ts";

function isRange(value: Position | Range): value is Range {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.hasOwn(value, "start") &&
    Object.hasOwn(value, "end")
  );
}

function unavailableFileQuery<T>(operation: string, file: string): CodeQueryResult<T> {
  return unavailableCodeQuery(`No routed LSP client could complete ${operation} for ${file}.`);
}

function hasProcessCrashRecovery(report: ProcessCrashRecoveryReport): boolean {
  return (
    report.recoveredRoutes > 0 ||
    report.skippedRoutes > 0 ||
    report.failedRoutes > 0 ||
    report.exhaustedRoutes > 0
  );
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

const FILE_STARTUP_FAILURE_REASON = "The routed LSP client could not be started for this file";

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
    const client = await this.manager.ensureFileOpen(resolvedPath, {
      recoverProcessCrash: true,
      protectInputs: true,
      control,
    });
    if (!client) return unavailableFileQuery("hover", resolvedPath);
    return client.hover(resolvedPath, position, control);
  }

  async definition(
    filePath: string,
    position: Position,
    control?: CodeRequestControl,
  ): Promise<CodeQueryResult<Location | Location[] | LocationLink[] | null>> {
    const resolvedPath = this.resolveFilePath(filePath);
    const client = await this.manager.ensureFileOpen(resolvedPath, {
      recoverProcessCrash: true,
      protectInputs: true,
      control,
    });
    if (!client) return unavailableFileQuery("definition", resolvedPath);
    return client.definition(resolvedPath, position, control);
  }

  async references(
    filePath: string,
    position: Position,
    control?: CodeRequestControl,
  ): Promise<CodeQueryResult<Location[]>> {
    const resolvedPath = this.resolveFilePath(filePath);
    const client = await this.manager.ensureFileOpen(resolvedPath, {
      recoverProcessCrash: true,
      protectInputs: true,
      control,
    });
    if (!client) return unavailableFileQuery("references", resolvedPath);
    return this.withProjectCoverage(
      client,
      { file: resolvedPath, position },
      "references",
      mapCodeQueryResult(
        await client.references(resolvedPath, position, control),
        (data) => data ?? [],
      ),
    );
  }

  async implementation(
    filePath: string,
    position: Position,
    control?: CodeRequestControl,
  ): Promise<CodeQueryResult<Location | Location[] | LocationLink[] | null>> {
    const resolvedPath = this.resolveFilePath(filePath);
    const client = await this.manager.ensureFileOpen(resolvedPath, {
      recoverProcessCrash: true,
      protectInputs: true,
      control,
    });
    if (!client) return unavailableFileQuery("implementation", resolvedPath);
    return this.withProjectCoverage(
      client,
      { file: resolvedPath, position },
      "implementation",
      await client.implementation(resolvedPath, position, control),
    );
  }

  /**
   * Downgrade a completed project-wide answer to partial when the TypeScript
   * server may not have searched every relevant project.
   */
  private withProjectCoverage<T extends Location[] | Location | LocationLink[] | null>(
    client: NonNullable<Awaited<ReturnType<LspManager["ensureFileOpen"]>>>,
    target: { readonly file: string; readonly position: Position },
    request: "references" | "implementation",
    result: CodeQueryResult<T>,
  ): CodeQueryResult<T> {
    if (result.kind !== "completed") return result;
    const gap = this.manager.typeScriptProjectCoverageGap(client, target.file, request, {
      resultFiles: locationFiles(result.data),
      position: target.position,
    });
    return gap ? partialCodeQuery(result.data, gap) : result;
  }

  async documentSymbols(
    filePath: string,
    control?: CodeRequestControl,
  ): Promise<CodeQueryResult<DocumentSymbol[] | SymbolInformation[]>> {
    const resolvedPath = this.resolveFilePath(filePath);
    const client = await this.manager.ensureFileOpen(resolvedPath, {
      recoverProcessCrash: true,
      protectInputs: true,
      control,
    });
    if (!client) return unavailableFileQuery("document symbols", resolvedPath);
    return mapCodeQueryResult(
      await client.documentSymbols(resolvedPath, control),
      (data) => data ?? [],
    );
  }

  async workspaceSymbol(
    query: string,
    control?: CodeRequestControl,
    scopes?: readonly string[],
  ): Promise<CodeQueryResult<SymbolInformation[] | WorkspaceSymbol[]>> {
    return this.manager.workspaceSymbol(query, control, scopes);
  }

  async rename(
    filePath: string,
    position: Position,
    newName: string,
    control?: CodeRequestControl,
  ): Promise<RoutedMutationResponse<WorkspaceEdit | null> | null> {
    return runRoutedRename({
      manager: this.manager,
      file: this.resolveFilePath(filePath),
      position,
      newName,
      control,
    });
  }

  getOpenDocumentVersion(filePath: string): number | null {
    return this.manager.getOpenDocumentVersion(this.resolveFilePath(filePath));
  }

  async captureCodeActionEdit(
    filePath: string,
    action: CodeAction,
    control?: CodeRequestControl,
  ): Promise<RoutedMutationResponse<CommandEditCaptureResult | null> | null> {
    const resolvedPath = this.resolveFilePath(filePath);
    const client = await this.manager.ensureFileOpen(resolvedPath, {
      recoverProcessCrash: true,
      protectInputs: true,
      control,
    });
    if (!client) return null;
    const authorizedMutationRoots = [client.root];
    const outside = outsideRouteRootReason(resolvedPath, client.root);
    if (outside) return { value: null, authorizedMutationRoots, reason: outside };
    const listed = client.serverCapabilities?.executeCommandProvider?.commands;
    const [eligible] = captureEligibleActions([action], Array.isArray(listed) ? listed : undefined);
    if (!eligible) {
      return { value: null, authorizedMutationRoots, reason: COMMAND_ONLY_ACTION_REASON };
    }
    const value = await client.captureCommandEdits(eligible.command, {
      timeoutMs: COMMAND_CAPTURE_TIMEOUT_MS,
      ...(control ? { control } : {}),
    });
    return { value, authorizedMutationRoots };
  }

  async codeActions(
    filePath: string,
    positionOrRange: Position | Range,
    control?: CodeRequestControl,
    options?: WorkspaceCodeActionRequestOptions,
  ): Promise<RoutedCodeActionResponse | null> {
    const resolvedPath = this.resolveFilePath(filePath);
    const client = await this.manager.ensureFileOpen(resolvedPath, {
      recoverProcessCrash: true,
      protectInputs: true,
      control,
    });
    if (!client) return null;
    const outside = outsideRouteRootReason(resolvedPath, client.root);
    if (outside) {
      return { value: null, authorizedMutationRoots: [client.root], reason: outside };
    }

    const range = isRange(positionOrRange)
      ? positionOrRange
      : { start: positionOrRange, end: positionOrRange };
    const diagnostics = client
      .getDiagnostics(resolvedPath)
      .filter((diagnostic) => diagnostic.range.end.line >= range.start.line)
      .filter((diagnostic) => diagnostic.range.start.line <= range.end.line);

    const context = {
      diagnostics,
      triggerKind: options?.triggerKind ?? CodeActionTriggerKind.Invoked,
      ...(options?.only ? { only: [...options.only] } : {}),
    };
    const advertisedKinds = advertisedCodeActionKinds(client.serverCapabilities ?? null);
    const advertisedCommands = client.serverCapabilities?.executeCommandProvider?.commands;
    const routed = {
      authorizedMutationRoots: [client.root],
      ...(advertisedKinds ? { advertisedKinds } : {}),
      ...(Array.isArray(advertisedCommands) ? { advertisedCommands } : {}),
    };
    if (typeof client.codeActionsDetailed === "function") {
      const result = await client.codeActionsDetailed(resolvedPath, range, context, control);
      // A completed `null` result means the server has no actions here (LSP spec).
      return result.kind === "completed"
        ? { ...routed, value: result.data ?? [] }
        : { ...routed, value: null, reason: result.reason };
    }
    return {
      ...routed,
      value: (await client.codeActions(resolvedPath, range, context, control)) ?? [],
    };
  }

  /**
   * Wait until the LSP client that owns a file is ready for semantic queries.
   * Performs a lightweight semantic warm-up probe before resolving.
   */
  async waitUntilReadyForFile(
    filePath: string,
    options: { timeoutMs?: number; retryFailedRoute?: boolean } = {},
    control?: CodeRequestControl,
  ): Promise<SemanticReadinessResult> {
    const resolvedPath = this.resolveFilePath(filePath);
    if (!options.retryFailedRoute && !this.manager.canServeFile(resolvedPath)) {
      const processCrashRecovery = this.manager.getProcessCrashRecoveryReportForFile(resolvedPath);
      return {
        kind: "unavailable",
        reason: this.fileUnavailableReason(resolvedPath, "No LSP client can serve this file"),
        ...(processCrashRecovery ? { processCrashRecovery } : {}),
      };
    }

    let eagerProcessCrashRecovery: ProcessCrashRecoveryReport | undefined;
    let eagerStartupRetry: StartupRetryReport | undefined;
    const readiness = await raceReadinessValue(
      this.manager.waitUntilFileReady(resolvedPath, control, {
        retryFailedRoute: options.retryFailedRoute === true,
        onProcessCrashRecovery: (report) => {
          eagerProcessCrashRecovery = report;
        },
        onStartupRetry: (report) => {
          eagerStartupRetry = report;
        },
      }),
      options.timeoutMs,
      control,
    );
    if (readiness.kind !== "resolved") {
      // A timeout can happen before shared recovery settles. Keep only route
      // outcomes that completed before the timeout.
      const currentProcessCrashRecovery =
        this.manager.getProcessCrashRecoveryReportForFile(resolvedPath);
      const processCrashRecovery = currentProcessCrashRecovery ?? eagerProcessCrashRecovery;
      return {
        ...readiness,
        ...(eagerStartupRetry ? { startupRetry: eagerStartupRetry } : {}),
        ...(processCrashRecovery ? { processCrashRecovery } : {}),
      };
    }
    const { client, processCrashRecovery, startupRetry } = readiness.value;
    const recovery = hasProcessCrashRecovery(processCrashRecovery) ? { processCrashRecovery } : {};
    const startup = startupRetry && startupRetry.entries.length > 0 ? { startupRetry } : {};
    if (!client) {
      return {
        kind: "unavailable",
        reason: this.fileUnavailableReason(resolvedPath, FILE_STARTUP_FAILURE_REASON),
        ...startup,
        ...recovery,
      };
    }
    return { kind: "ready", ...startup, ...recovery };
  }

  private fileUnavailableReason(filePath: string, configuredRouteReason: string): string {
    if (!this.manager.hasConfiguredServerForFile(filePath)) {
      return "No compatible LSP server is configured for this file";
    }
    return this.manager.hasFailedStartupForFile(filePath)
      ? FILE_STARTUP_FAILURE_REASON
      : configuredRouteReason;
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

  /** Check whether automatic LSP work can use and serve the source file. */
  isSupportedSourceFile(filePath: string): boolean {
    return this.manager.isSupportedSourceFile(this.resolveFilePath(filePath));
  }

  /** Inventory automatic workspace sentinel and source paths. */
  scanWorkspaceSentinels(options: WorkspaceSentinelScanOptions = {}): Map<string, number> {
    return this.manager.scanWorkspaceSentinels(options);
  }

  /** Scan configured source extensions under the automatic path policy. */
  scanWorkspaceSources(control?: CodeRequestControl) {
    return this.manager.scanWorkspaceSources(control);
  }

  /** Refresh the automatic workspace sentinel. */
  syncWorkspaceSentinelSnapshot(
    previous: Map<string, number>,
    options: WorkspaceSentinelScanOptions = {},
  ): WorkspaceSentinelSyncResult {
    return this.manager.syncWorkspaceSentinelSnapshot(previous, options);
  }

  /** Track a bounded set of source files without exposing clients. */
  bulkTrackFiles(
    filePaths: readonly string[],
    control?: CodeRequestControl,
  ): Promise<BulkTrackFilesResult> {
    return this.manager.bulkTrackFiles(filePaths, control);
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

  /** Synchronize tracked files after successful writes and send requested saves. */
  noteWorkspaceWrites(changes: FileEvent[]): void {
    this.manager.clearAllPullResultIds();
    this.manager.noteWorkspaceWrites(changes);
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

  /** Retry failed routes and run a workspace-wide diagnostic recovery pass. */
  async recoverDiagnostics(options?: {
    restartIfStillStale?: boolean;
    maxWaitMs?: number;
    quietMs?: number;
    /** Evidence from a refresh the caller already completed; skips this pass's own refresh when no watched-file changes apply. */
    initialEvidence?: DiagnosticEvidenceSummary;
    /** Explicit demand to retry failed startup and crashed routes in scope. */
    processCrashDemand?: import("./runtime-diagnostic-surface.ts").ProcessCrashDiagnosticDemand;
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
          processCrashRecovery: result.processCrashRecovery,
          startupRetry: result.startupRetry,
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

/** Local file paths of LSP locations or location links; non-file URIs are skipped. */
function locationFiles(data: Location[] | Location | LocationLink[] | null): string[] {
  const items: (Location | LocationLink)[] =
    data === null ? [] : Array.isArray(data) ? data : [data];
  return items.flatMap((item) => {
    const uri = "targetUri" in item ? item.targetUri : item.uri;
    if (!uri.startsWith("file:")) return [];
    try {
      return [fileURLToPath(uri)];
    } catch {
      return [];
    }
  });
}

/** Remove the LSP service state for a session cwd. */
export function clearWorkspaceLspRuntime(cwd: string): void {
  registry.clear(cwd);
}
