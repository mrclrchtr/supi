// Public session factory, shared session service access, and re-exports for @mrclrchtr/supi-tree-sitter.
//
// This package is library-only — no pi extension surface.
// Tool handler string-formatting lives in @mrclrchtr/supi-code-intelligence.

// Language detection helpers
export {
  detectGrammar,
  getSupportedExtension,
  getSupportedExtensions,
  isJsTsGrammar,
  isSupportedFile,
} from "./language.ts";
// Provider implementation
export { createTreeSitterProvider } from "./provider/tree-sitter-provider.ts";
export { TreeSitterRuntime } from "./session/runtime.ts";
export type {
  TsControllerState,
  TsStartResult,
} from "./session/runtime-controller.ts";
export { TreeSitterRuntimeController } from "./session/runtime-controller.ts";
export { getSessionTreeSitterService } from "./session/service-registry.ts";
export { createTreeSitterSession } from "./session/session.ts";
// Structural extraction services (consumed by supi-code-intelligence tool execution)
export { extractCallSites } from "./tool/call-sites.ts";
export { lookupCalleesAt } from "./tool/callees.ts";
export { extractExports } from "./tool/exports.ts";
export { extractImports } from "./tool/imports.ts";
export { lookupNodeAt } from "./tool/node-at.ts";
export { collectOutline } from "./tool/outline.ts";
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
