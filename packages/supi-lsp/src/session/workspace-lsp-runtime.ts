import type { CodeQueryResult, CodeRequestControl } from "@mrclrchtr/supi-code-runtime/api";
import type {
  CodeAction,
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
import type {
  WorkspaceSentinelScanOptions,
  WorkspaceSentinelSyncResult,
} from "../diagnostics/workspace-sentinels.ts";
import type { WorkspaceSourceInventory } from "../diagnostics/workspace-sources.ts";
import type { WorkspaceLspDiagnosticSurface } from "./runtime-diagnostic-surface.ts";
import type { ProcessCrashRecoveryReport, StartupRetryReport } from "./runtime-diagnostics.ts";

/** Maximum number of files processed by one automatic bulk-tracking call. */
export const MAX_BULK_TRACK_FILES = 256;

export type WorkspaceLspRuntimeState =
  | { kind: "ready"; runtime: WorkspaceLspRuntime }
  | { kind: "inactive"; runtime: WorkspaceLspRuntime }
  | { kind: "pending" }
  | { kind: "disabled" }
  | { kind: "unavailable"; reason: string };

export type SemanticReadinessResult =
  | {
      kind: "ready";
      /** Initial-start retry observed while establishing file readiness. */
      startupRetry?: StartupRetryReport;
      /** Process-crash route recovery observed while establishing file readiness. */
      processCrashRecovery?: ProcessCrashRecoveryReport;
    }
  | {
      kind: "timeout";
      /** Initial-start retry observed before the readiness timeout. */
      startupRetry?: StartupRetryReport;
      /** Process-crash route recovery observed before the readiness timeout. */
      processCrashRecovery?: ProcessCrashRecoveryReport;
    }
  | {
      kind: "unavailable";
      reason: string;
      /** Initial-start retry observed before readiness became unavailable. */
      startupRetry?: StartupRetryReport;
      /** Process-crash route recovery observed before readiness became unavailable. */
      processCrashRecovery?: ProcessCrashRecoveryReport;
    };

/** One mutation response and the exact provider roots from its semantic route. */
export interface RoutedMutationResponse<T> {
  /** Provider response from the routed client. */
  readonly value: T;
  /** Roots that the routed client owns for this mutation response. */
  readonly authorizedMutationRoots: readonly string[];
}

/** Outcome for one path selected by a bounded automatic tracking batch. */
export type BulkTrackFileOutcome =
  | { readonly file: string; readonly kind: "tracked" }
  | { readonly file: string; readonly kind: "already-tracked" }
  | {
      readonly file: string;
      readonly kind: "unsupported";
      readonly reason: "missing" | "not-automatic-source";
    }
  | { readonly file: string; readonly kind: "unavailable"; readonly reason: string };

/** Result of one bounded automatic tracking batch. */
export interface BulkTrackFilesResult {
  readonly outcomes: readonly BulkTrackFileOutcome[];
}

/**
 * Workspace-scoped LSP interface that owns routing, readiness, semantic operations,
 * diagnostics, and recovery without exposing clients or the mutable manager.
 * File paths can be absolute or session-cwd-relative. A leading `@` is removed to
 * match Pi's built-in path-tool convention. Positions use raw 0-based LSP coordinates.
 * Request control is forwarded to the routed client and limits the caller's
 * wait without cancelling shared route recovery.
 */
export interface WorkspaceLspRuntime extends WorkspaceLspDiagnosticSurface {
  hover(
    filePath: string,
    position: Position,
    control?: CodeRequestControl,
  ): Promise<CodeQueryResult<Hover | null>>;
  definition(
    filePath: string,
    position: Position,
    control?: CodeRequestControl,
  ): Promise<CodeQueryResult<Location | Location[] | LocationLink[] | null>>;
  references(
    filePath: string,
    position: Position,
    control?: CodeRequestControl,
  ): Promise<CodeQueryResult<Location[]>>;
  implementation(
    filePath: string,
    position: Position,
    control?: CodeRequestControl,
  ): Promise<CodeQueryResult<Location | Location[] | LocationLink[] | null>>;
  documentSymbols(
    filePath: string,
    control?: CodeRequestControl,
  ): Promise<CodeQueryResult<DocumentSymbol[] | SymbolInformation[]>>;
  /** Collect symbols from routes that can contribute within the optional path scopes. */
  workspaceSymbol(
    query: string,
    control?: CodeRequestControl,
    scopes?: readonly string[],
  ): Promise<CodeQueryResult<SymbolInformation[] | WorkspaceSymbol[]>>;
  rename(
    filePath: string,
    position: Position,
    newName: string,
    control?: CodeRequestControl,
  ): Promise<RoutedMutationResponse<WorkspaceEdit | null> | null>;
  codeActions(
    filePath: string,
    positionOrRange: Position | Range,
    control?: CodeRequestControl,
  ): Promise<RoutedMutationResponse<CodeAction[] | null> | null>;
  getOpenDocumentVersion(filePath: string): number | null;
  /**
   * Wait for file readiness; an explicit refresh may make one shared route
   * retry for this call without changing ordinary request recovery limits.
   */
  waitUntilReadyForFile(
    filePath: string,
    options?: { timeoutMs?: number; retryFailedRoute?: boolean },
    control?: CodeRequestControl,
  ): Promise<SemanticReadinessResult>;
  waitUntilReadyForWorkspace(
    options?: { timeoutMs?: number },
    control?: CodeRequestControl,
  ): Promise<SemanticReadinessResult>;
  getProjectServers(): ProjectServerInfo[];
  /** Check whether automatic LSP work can use and serve the source file. */
  isSupportedSourceFile(filePath: string): boolean;
  /** Inventory policy-eligible workspace sentinels. */
  scanWorkspaceSentinels(options?: WorkspaceSentinelScanOptions): Map<string, number>;
  /** Scan configured source extensions under the automatic path policy. */
  scanWorkspaceSources(control?: CodeRequestControl): Promise<WorkspaceSourceInventory>;
  /** Refresh one policy-eligible workspace sentinel. */
  syncWorkspaceSentinelSnapshot(
    previous: Map<string, number>,
    options?: WorkspaceSentinelScanOptions,
  ): WorkspaceSentinelSyncResult;
  /**
   * Track a bounded, deduplicated set of automatic source files. Inputs after
   * the first 256 unique paths are ignored; callers must retain those paths.
   */
  bulkTrackFiles(
    filePaths: readonly string[],
    control?: CodeRequestControl,
  ): Promise<BulkTrackFilesResult>;
  trackFile(filePath: string): Promise<boolean>;
  closeFile(filePath: string): void;
  pruneMissingFiles(): readonly string[];
  noteWorkspaceChanges(changes: FileEvent[]): void;
}
