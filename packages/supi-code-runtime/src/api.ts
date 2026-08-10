/**
 * Public API surface for @mrclrchtr/supi-code-runtime.
 *
 * This package exports shared canonical types, capability interfaces,
 * and workspace runtime primitives.
 * It is a library-only package with no pi extension entrypoint.
 */

// Capability interfaces and availability states
export type {
  CapabilityState,
  SemanticProvider,
  StructuralProvider,
  StructuralResult,
} from "./capability/types.ts";
export type { CodeQueryResult } from "./query-result.ts";
// Shared query-result constructors and contract
export {
  completedCodeQuery,
  mapCodeQueryResult,
  partialCodeQuery,
  unavailableCodeQuery,
} from "./query-result.ts";
// Shared canonical types
export type {
  CalleeDepth,
  CalleesData,
  CallSite,
  CodeLocation,
  CodePosition,
  CodeResult,
  CodeSymbol,
  ConfidenceMode,
  DeclarationNesting,
  DisambiguationCandidate,
  DocumentCodeSymbol,
  ExportData,
  FileEdit,
  ImportData,
  NodeAtData,
  OutlineData,
  RefactorOperation,
  RefactorRequest,
  RefactorResult,
  SourceRange,
  WorkspaceEdit,
} from "./types.ts";
export type { WorkspaceCapabilities } from "./workspace/runtime.ts";
// Workspace runtime
export { getDefaultWorkspaceRuntime, WorkspaceRuntime } from "./workspace/runtime.ts";
