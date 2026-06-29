/**
 * Package-root re-export surface for @mrclrchtr/supi-code-runtime.
 *
 * Prefer importing from `@mrclrchtr/supi-code-runtime/api` for explicit
 * access to the shared contracts and workspace primitives.
 */

export type {
  CalleeDepth,
  CalleesData,
  CallSite,
  CapabilityState,
  CodeLocation,
  CodePosition,
  CodeResult,
  CodeSymbol,
  ConfidenceMode,
  ExportData,
  ImportData,
  NodeAtData,
  OutlineData,
  RefactorOperation,
  RefactorRequest,
  SemanticProvider,
  SourceRange,
  StructuralProvider,
  StructuralResult,
  WorkspaceCapabilities,
  WorkspaceContext,
} from "./api.ts";
export {
  createWorkspaceContext,
  getDefaultWorkspaceRuntime,
  normalizeRefactorOperation,
  WorkspaceRuntime,
} from "./api.ts";
