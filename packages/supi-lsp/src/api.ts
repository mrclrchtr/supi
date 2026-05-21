// Public API surface for the LSP session-scoped service.

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
