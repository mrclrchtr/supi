// Public API surface for the LSP session-scoped service.

export { type LoadConfigOptions, loadConfig } from "./config/config.ts";
export type { LspSettings } from "./config/lsp-settings.ts";
export { loadLspSettings } from "./config/lsp-settings.ts";
export {
  clearTsconfigCache,
  type FileScopeDecision,
  type FileScopeStatus,
  getFileScopeDecision,
  invalidateTsconfigCacheForConfig,
  invalidateTsconfigCacheForConfigDir,
  isProjectConfigFileName,
  type ScopeDecisionBasis,
} from "./config/tsconfig-scope.ts";
export type {
  CodeAction,
  Diagnostic,
  DocumentSymbol,
  FileEvent,
  Hover,
  Location,
  LocationLink,
  LspConfig,
  MissingServer,
  Position,
  ProjectServerInfo,
  ProjectServerStatusReason,
  Range,
  SymbolInformation,
  WorkspaceEdit,
  WorkspaceSymbol,
} from "./config/types.ts";
export { FileChangeType } from "./config/types.ts";
export { toLspPosition, toOneBasedPosition } from "./coordinates.ts";
export { TENTATIVE_PUSH_UNAVAILABLE_REASON } from "./diagnostics/evidence.ts";
export { isLikelyStaleDiagnostic } from "./diagnostics/stale-diagnostics.ts";
export {
  scanWorkspaceSentinels,
  syncWorkspaceSentinelSnapshot,
  type WorkspaceSentinelScanOptions,
  type WorkspaceSentinelSyncResult,
} from "./diagnostics/workspace-sentinels.ts";
export { raceReadinessValue, raceRequestControl } from "./session/readiness.ts";
export type {
  LspControllerState,
  LspRuntimeTransition,
  LspRuntimeTransitionKind,
  LspRuntimeTransitionListener,
  LspStartResult,
} from "./session/runtime-controller.ts";
export { LspRuntimeController } from "./session/runtime-controller.ts";
export type {
  DiagnosticEvidenceDocument,
  DiagnosticEvidenceStatus,
  DiagnosticEvidenceSummary,
  OutstandingDiagnosticSummaryEntry,
  ProcessCrashDiagnosticDemand,
  ProcessCrashRecoveryEntry,
  ProcessCrashRecoveryNextAction,
  ProcessCrashRecoveryOutcome,
  ProcessCrashRecoveryReport,
  RecoverDiagnosticsResult,
  RoutedMutationResponse,
  SemanticReadinessResult,
  WorkspaceDiagnosticReport,
  WorkspaceDiagnosticSnapshot,
  WorkspaceDiagnosticSummaryEntry,
  WorkspaceLspDiagnosticSurface,
  WorkspaceLspRuntime,
  WorkspaceLspRuntimeState,
} from "./session/runtime-registry.ts";
export {
  clearWorkspaceLspRuntime,
  emptyProcessCrashRecoveryReport,
  getWorkspaceLspRuntime,
  MAX_PROCESS_CRASH_RECOVERY_ENTRIES,
  setWorkspaceLspRuntimeState,
  waitForWorkspaceLspRuntime,
} from "./session/runtime-registry.ts";
export { scanMissingServers } from "./session/scanner.ts";
export {
  AUTOMATIC_LSP_EXCLUDED_DIRECTORIES,
  type AutomaticLspPathPolicy,
  createAutomaticLspPathPolicy,
  createDefaultAutomaticLspPathPolicy,
} from "./workspace-path-policy.ts";
