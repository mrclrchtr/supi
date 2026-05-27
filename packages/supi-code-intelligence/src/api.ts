// Reusable architecture and target-resolution helpers for peer extensions.
// Non-provider contracts for the code-understanding stack.

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
// Architecture model hosted locally in supi-code-intelligence.
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
  resolveAnchoredTarget,
  resolveSymbolTarget,
  toZeroBased,
} from "./target-resolution.ts";
// Code-intelligence-specific types (not shared with the runtime)
export type {
  AffectedDetails,
  BriefDetails,
  CodeIntelResult,
  DisambiguationCandidate,
  MapDetails,
  SearchDetails,
} from "./types.ts";
