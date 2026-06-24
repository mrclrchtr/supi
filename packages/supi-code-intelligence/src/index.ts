// Package root exports for @mrclrchtr/supi-code-intelligence.
// Peer extensions can import these APIs for programmatic access.

// Provider contracts and shared canonical types from the shared runtime.
// Provider contracts also available as substrate type aliases for backward compat.
export type {
  CalleesData,
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
  SemanticProvider,
  SemanticProvider as SemanticSubstrate,
  SourceRange,
  StructuralProvider,
  StructuralProvider as StructuralSubstrate,
  StructuralResult,
} from "@mrclrchtr/supi-code-runtime/api";
// Code provider — reads capabilities from the shared workspace runtime.
export type { CodeProvider, CodeProviderState } from "./analysis/context/request-context.ts";
export { getCodeProvider } from "./analysis/context/request-context.ts";
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
export type { ResolvedTarget, TargetResolutionResult } from "./target-resolution.ts";
export {
  normalizePath,
  resolveSymbolTarget,
  toZeroBased,
} from "./target-resolution.ts";
// Code-intelligence-specific types (not shared with the runtime)
export type {
  AffectedDetails,
  BriefDetails,
  CodeIntelResult,
  DisambiguationCandidate,
  InspectDetails,
  SearchDetails,
  TestSurfaceDetails,
} from "./types.ts";
