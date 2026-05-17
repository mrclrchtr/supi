// Public library entrypoint for @mrclrchtr/supi-lsp/api.
// Import from the package root to reuse session-scoped LSP services
// without reaching into private implementation files.

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
