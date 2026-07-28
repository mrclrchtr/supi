/**
 * Public API surface for @mrclrchtr/supi-code-runtime.
 *
 * This package exports shared canonical types, capability interfaces,
 * workspace runtime primitives, and typed request context helpers.
 * It is a library-only package with no pi extension entrypoint.
 */

// Evidence display — re-exported from supi-core
export { type EvidenceBadgeInput, formatEvidenceBadge } from "@mrclrchtr/supi-core/evidence-badge";
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
export type { WorkspaceContext } from "./workspace/context.ts";
// Workspace context
export { createWorkspaceContext } from "./workspace/context.ts";
export type { WorkspaceCapabilities } from "./workspace/runtime.ts";
// Workspace runtime
export { getDefaultWorkspaceRuntime, WorkspaceRuntime } from "./workspace/runtime.ts";
