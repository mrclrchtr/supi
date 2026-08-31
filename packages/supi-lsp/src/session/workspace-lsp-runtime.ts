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
import type { WorkspaceLspDiagnosticSurface } from "./runtime-diagnostic-surface.ts";
import type { ProcessCrashRecoverySummary } from "./runtime-diagnostics.ts";

export type WorkspaceLspRuntimeState =
  | { kind: "ready"; runtime: WorkspaceLspRuntime }
  | { kind: "inactive"; runtime: WorkspaceLspRuntime }
  | { kind: "pending" }
  | { kind: "disabled" }
  | { kind: "unavailable"; reason: string };

export type SemanticReadinessResult =
  | {
      kind: "ready";
      /** Process-crash route recovery observed while establishing file readiness. */
      processCrashRecovery?: ProcessCrashRecoverySummary;
    }
  | {
      kind: "timeout";
      /** Process-crash route recovery observed before the readiness timeout. */
      processCrashRecovery?: ProcessCrashRecoverySummary;
    }
  | {
      kind: "unavailable";
      reason: string;
      /** Process-crash route recovery observed before readiness became unavailable. */
      processCrashRecovery?: ProcessCrashRecoverySummary;
    };

/** One mutation response and the exact provider roots from its semantic route. */
export interface RoutedMutationResponse<T> {
  /** Provider response from the routed client. */
  readonly value: T;
  /** Roots that the routed client owns for this mutation response. */
  readonly authorizedMutationRoots: readonly string[];
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
  waitUntilReadyForFile(
    filePath: string,
    options?: { timeoutMs?: number },
    control?: CodeRequestControl,
  ): Promise<SemanticReadinessResult>;
  waitUntilReadyForWorkspace(
    options?: { timeoutMs?: number },
    control?: CodeRequestControl,
  ): Promise<SemanticReadinessResult>;
  getProjectServers(): ProjectServerInfo[];
  isSupportedSourceFile(filePath: string): boolean;
  trackFile(filePath: string): Promise<boolean>;
  closeFile(filePath: string): void;
  pruneMissingFiles(): readonly string[];
  noteWorkspaceChanges(changes: FileEvent[]): void;
}
