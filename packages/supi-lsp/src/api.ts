// Public API surface for the LSP session-scoped service.

export type {
  Diagnostic,
  DocumentSymbol,
  Hover,
  Location,
  LocationLink,
  Position,
  ProjectServerInfo,
  SymbolInformation,
  WorkspaceSymbol,
} from "./config/types.ts";
export type { SessionLspServiceState } from "./session/service-registry.ts";
export { getSessionLspService, SessionLspService } from "./session/service-registry.ts";
