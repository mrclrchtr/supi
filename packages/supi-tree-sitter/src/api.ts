// Public tree-sitter session factory, shared session service access, and shared types.
//
// This package is library-only — no pi extension surface.
// Exports structured runtime/service APIs only.
// Tool handler string-formatting lives in @mrclrchtr/supi-code-intelligence.

// Language detection helpers
export {
  detectGrammar,
  getSupportedExtension,
  getSupportedExtensions,
  isJsTsGrammar,
  isSupportedFile,
} from "./language.ts";
export type { StructuralSearchOperation } from "./operation-support.ts";
export { getStructuralSearchSupportedExtensions } from "./operation-support.ts";
export type {
  TsControllerState,
  TsStartResult,
} from "./session/runtime-controller.ts";
export { TreeSitterRuntimeController } from "./session/runtime-controller.ts";
export { getSessionTreeSitterService } from "./session/service-registry.ts";
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
  SessionTreeSitterService,
  SessionTreeSitterServiceState,
  SourceRange,
  SupportedExtension,
  TreeSitterResult,
  TreeSitterService,
  TreeSitterSession,
} from "./types.ts";
