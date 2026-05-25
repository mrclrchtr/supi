// Package root exports for @mrclrchtr/supi-code-intelligence.
// Peer extensions can import these APIs for programmatic access.

// Provider contracts re-exported from the shared runtime for convenience.
export type {
  SemanticProvider,
  StructuralProvider,
  StructuralResult,
} from "@mrclrchtr/supi-code-runtime/api";
export { generateFocusedBrief, generateOverview, generateProjectBrief } from "./brief.ts";
export type {
  ArchitectureModel,
  DependencyEdge,
  ModuleInfo,
} from "./model.ts";
export {
  buildArchitectureModel,
  findModuleForPath,
  getDependencies,
  getDependents,
} from "./model.ts";
// Substrate adapters (type aliases for provider contracts)
export type {
  SemanticSubstrate,
  StructuralSubstrate,
} from "./substrates/types.ts";
export type { ResolvedTarget, TargetResolutionResult } from "./target-resolution.ts";
export {
  normalizePath,
  resolveAnchoredTarget,
  resolveSymbolTarget,
  toZeroBased,
} from "./target-resolution.ts";
// Shared canonical types
export type {
  AffectedDetails,
  BriefDetails,
  CalleesData,
  CodeIntelResult,
  CodeLocation,
  CodePosition,
  CodeResult,
  CodeSymbol,
  ConfidenceMode,
  DisambiguationCandidate,
  ExportData,
  ImportData,
  MapDetails,
  NodeAtData,
  OutlineData,
  ProviderAvailability,
  SearchDetails,
  SourceRange,
} from "./types.ts";
// Code provider — reads capabilities from the shared workspace runtime.
export type { CodeProvider, CodeProviderState } from "./workspace/request-context.ts";
export { getCodeProvider } from "./workspace/request-context.ts";
