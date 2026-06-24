/**
 * Public API surface for @mrclrchtr/supi-code-runtime.
 *
 * This package exports shared canonical types, capability interfaces,
 * workspace runtime primitives, and typed request context helpers.
 * It is a library-only package with no pi extension entrypoint.
 */

// Capability interfaces and availability states
export type {
  CapabilityState,
  SemanticProvider,
  StructuralProvider,
  StructuralResult,
} from "./capability/types.ts";
// Evidence display
export { type EvidenceBadgeInput, formatEvidenceBadge } from "./evidence-badge.ts";
// Shared canonical types
export type {
  CalleesData,
  CallSite,
  CodeLocation,
  CodePosition,
  CodeResult,
  CodeSymbol,
  ConfidenceMode,
  DisambiguationCandidate,
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
export { normalizeRefactorOperation } from "./types.ts";
export type { WorkspaceContext } from "./workspace/context.ts";
// Workspace context
export { createWorkspaceContext } from "./workspace/context.ts";
export type { WorkspaceCapabilities } from "./workspace/runtime.ts";
// Workspace runtime
export { getDefaultWorkspaceRuntime, WorkspaceRuntime } from "./workspace/runtime.ts";
