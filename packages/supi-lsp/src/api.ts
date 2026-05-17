// Public API surface for the LSP session-scoped service.

export type { SessionLspServiceState } from "./service-registry.ts";
export { getSessionLspService, SessionLspService } from "./service-registry.ts";
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
} from "./types.ts";
