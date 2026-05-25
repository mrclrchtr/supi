// Public tree-sitter session factory, shared session service access, and shared types.

export { TreeSitterRuntime } from "./session/runtime.ts";
export type {
  TsControllerState,
  TsStartResult,
} from "./session/runtime-controller.ts";
export { TreeSitterRuntimeController } from "./session/runtime-controller.ts";
export { getSessionTreeSitterService } from "./session/service-registry.ts";
export { createTreeSitterSession } from "./session/session.ts";
// Tool handler functions and registration — exported for umbrella adapter consumption
export {
  handleCallees,
  handleExports,
  handleImports,
  handleNodeAt,
  handleOutline,
  handleQuery,
} from "./tool/handlers.ts";
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
