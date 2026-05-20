// Public library entrypoint for @mrclrchtr/supi-lsp/api.
// Import from the package root to reuse session-scoped LSP services
// without reaching into private implementation files.

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
