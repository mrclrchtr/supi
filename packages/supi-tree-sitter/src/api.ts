// Public Tree-sitter session factory, lifecycle controller, and shared types.
//
// This package is library-only — no pi extension surface.
// Exports structured runtime/service APIs only.
// Tool handler string-formatting lives in @mrclrchtr/supi-code-intelligence.

// Language detection helpers
export {
  detectGrammar,
  getSupportedExtensions,
} from "./language.ts";
export type { StructuralSearchOperation } from "./operation-support.ts";
export { getStructuralSearchSupportedExtensions } from "./operation-support.ts";
export { TreeSitterRuntimeController } from "./session/runtime-controller.ts";
export { createTreeSitterSession } from "./session/session.ts";

// Shared types
export type {
  CalleesAtResult,
  CallSiteMatch,
  ExportRecord,
  GrammarId,
  ImportRecord,
  NodeAtResult,
  OutlineItem,
  QueryCapture,
  SourceRange,
  SupportedExtension,
  TreeSitterResult,
  TreeSitterService,
  TreeSitterSession,
} from "./types.ts";
