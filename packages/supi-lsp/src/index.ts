// Public library entrypoint for @mrclrchtr/supi-lsp/api.
// Consumers should import the published API surface from
// `@mrclrchtr/supi-lsp/api`, not the package root.

export type { LspSettings } from "./config/lsp-settings.ts";
export {
  getLspDisabledMessage,
  loadLspSettings,
} from "./config/lsp-settings.ts";
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
  SymbolInformation,
  WorkspaceEdit,
  WorkspaceSymbol,
} from "./config/types.ts";
export { toLspPosition, toOneBasedPosition } from "./coordinates.ts";
export type {
  LspControllerState,
  LspStartResult,
} from "./session/runtime-controller.ts";
export { LspRuntimeController } from "./session/runtime-controller.ts";
export type {
  OutstandingDiagnosticSummaryEntry,
  RecoverDiagnosticsResult,
  SemanticReadinessResult,
  SessionLspServiceState,
  WorkspaceDiagnosticSummaryEntry,
} from "./session/service-registry.ts";
export {
  getSessionLspService,
  SessionLspService,
  waitForSessionLspService,
} from "./session/service-registry.ts";
