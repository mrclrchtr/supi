// Public API surface for the LSP session-scoped service and runtime controller.

export type { LspSettings } from "./config/lsp-settings.ts";
export {
  getLspDisabledMessage,
  LSP_DEFAULTS,
  loadConfig,
  loadLspSettings,
} from "./config/lsp-settings.ts";
export { clearTsconfigCache } from "./config/tsconfig-scope.ts";
export type {
  CodeAction,
  Diagnostic,
  DocumentSymbol,
  Hover,
  Location,
  LocationLink,
  Position,
  ProjectServerInfo,
  Range,
  ServerCapabilities,
  SymbolInformation,
  WorkspaceEdit,
  WorkspaceSymbol,
} from "./config/types.ts";
export { toLspPosition, toOneBasedPosition } from "./coordinates.ts";

// Library runtime controller
export type { LspControllerStartResult } from "./session/runtime-controller.ts";
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
