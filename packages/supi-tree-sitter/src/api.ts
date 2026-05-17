// Public tree-sitter session factory and shared types.

export { createTreeSitterSession } from "./session.ts";
export type {
  CalleesAtResult,
  ExportRecord,
  GrammarId,
  ImportRecord,
  NodeAtResult,
  OutlineItem,
  QueryCapture,
  SourceRange,
  SupportedExtension,
  TreeSitterResult,
  TreeSitterSession,
} from "./types.ts";
