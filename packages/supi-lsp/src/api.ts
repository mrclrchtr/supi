// Public API surface for the LSP session-scoped service.

export { type LoadConfigOptions, loadConfig } from "./config/config.ts";
export type { LspSettings } from "./config/lsp-settings.ts";
export {
  getLspDisabledMessage,
  loadLspSettings,
} from "./config/lsp-settings.ts";
export { clearTsconfigCache } from "./config/tsconfig-scope.ts";
export type {
  CodeAction,
  Diagnostic,
  DocumentSymbol,
  FileEvent,
  Hover,
  Location,
  LocationLink,
  LspConfig,
  Position,
  ProjectServerInfo,
  Range,
  SymbolInformation,
  WorkspaceEdit,
  WorkspaceSymbol,
} from "./config/types.ts";
export { FileChangeType } from "./config/types.ts";
export { toLspPosition, toOneBasedPosition } from "./coordinates.ts";
export { isLikelyStaleDiagnostic } from "./diagnostics/stale-diagnostics.ts";
export {
  scanWorkspaceSentinels,
  syncWorkspaceSentinelSnapshot,
} from "./diagnostics/workspace-sentinels.ts";
export type {
  LspControllerState,
  LspStartResult,
} from "./session/runtime-controller.ts";
export { LspRuntimeController } from "./session/runtime-controller.ts";
export type {
  OutstandingDiagnosticSummaryEntry,
  RecoverDiagnosticsResult,
  SessionLspServiceState,
  WorkspaceDiagnosticSummaryEntry,
} from "./session/service-registry.ts";
export {
  getSessionLspService,
  SessionLspService,
  waitForSessionLspService,
} from "./session/service-registry.ts";
