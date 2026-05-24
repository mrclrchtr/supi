// Public session factory, shared session service access, and re-exports for @mrclrchtr/supi-tree-sitter.

export { getSessionTreeSitterService } from "./session/service-registry.ts";
export { createTreeSitterSession } from "./session/session.ts";
export type {
  CalleesAtResult,
  ExportRecord,
  GrammarId,
  ImportRecord,
  NodeAtResult,
  OutlineItem,
  QueryCapture,
  SessionTreeSitterService,
  SessionTreeSitterServiceState,
  SourceRange,
  SupportedExtension,
  TreeSitterResult,
  TreeSitterService,
  TreeSitterSession,
} from "./types.ts";
