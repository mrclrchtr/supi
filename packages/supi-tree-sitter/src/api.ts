// Public tree-sitter session factory, shared session service access, and shared types.

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
