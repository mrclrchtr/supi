// Public API surface for the LSP session-scoped service.

export { isMissingFileError } from "./client/client-file-state.ts";
export {
  getExplicitlyDisabledLanguages,
  type LoadConfigOptions,
  loadConfig,
} from "./config/config.ts";
export {
  codeActionKindsForOperation,
  getServerOperationSupport,
  isCodeActionKindInRange,
  REFACTOR_CODE_ACTION_KINDS,
  supportsCodeActionResolve,
  supportsCodeActions,
  supportsPrepareRename,
  supportsRename,
  supportsRequestedCodeActionKinds,
} from "./config/operation-support.ts";
export {
  clearTsconfigCache,
  type FileScopeDecision,
  type FileScopeStatus,
  getFileScopeDecision,
  invalidateTsconfigCacheForConfig,
  invalidateTsconfigCacheForConfigDir,
  isProjectConfigFileName,
  isTsconfigApplicableFile,
  type ScopeDecisionBasis,
} from "./config/tsconfig-scope.ts";
export type {
  CodeAction,
  Diagnostic,
  DocumentSymbol,
  FileEvent,
  Hover,
  JsonObject,
  JsonValue,
  Location,
  LocationLink,
  LspConfig,
  MissingServer,
  Position,
  ProjectServerInfo,
  ProjectServerStatusReason,
  Range,
  ServerAdvertisement,
  ServerOperationName,
  ServerOperationSupport,
  ServerOperationSupportMap,
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
export {
  scanWorkspaceSources,
  type WorkspaceSourceInventory,
  type WorkspaceSourceInventoryReason,
  type WorkspaceSourceScanOptions,
} from "./diagnostics/workspace-sources.ts";
export { raceReadinessValue, raceRequestControl } from "./session/readiness.ts";
export type {
  LspControllerState,
  LspRuntimeControllerOptions,
  LspRuntimeTransition,
  LspRuntimeTransitionKind,
  LspRuntimeTransitionListener,
  LspStartResult,
} from "./session/runtime-controller.ts";
export { LspRuntimeController } from "./session/runtime-controller.ts";
export type {
  BulkTrackFileOutcome,
  BulkTrackFilesResult,
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
  StartupRetryEntry,
  StartupRetryNextAction,
  StartupRetryOutcome,
  StartupRetryReport,
  WorkspaceCodeActionRequestOptions,
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
  emptyStartupRetryReport,
  getWorkspaceLspRuntime,
  MAX_PROCESS_CRASH_RECOVERY_ENTRIES,
  setWorkspaceLspRuntimeState,
  waitForWorkspaceLspRuntime,
} from "./session/runtime-registry.ts";
export { scanMissingServers } from "./session/scanner.ts";
export { MAX_BULK_TRACK_FILES } from "./session/workspace-lsp-runtime.ts";
export {
  AUTOMATIC_LSP_EXCLUDED_DIRECTORIES,
  type AutomaticLspPathPolicy,
  type AutomaticLspPathPolicyOptions,
  createAutomaticLspPathPolicy,
  createDefaultAutomaticLspPathPolicy,
} from "./workspace-path-policy.ts";
