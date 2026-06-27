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
export { normalizePath } from "./analysis/search/helpers.ts";
// Architecture model hosted locally in supi-code-intelligence.
export type {
  ArchitectureModel,
  DependencyEdge,
  ModuleInfo,
} from "./architecture/model.ts";
export {
  buildArchitectureModel,
  findModuleForPath,
  getDependencies,
  getDependents,
} from "./architecture/model.ts";
export type {
  ResolvedTargetData,
  ResolvedTargetGroupData,
  TargetOutcome,
} from "./targeting/types.ts";
// Code-intelligence-specific types (not shared with the runtime)
export type {
  AffectedDetails,
  BriefDetails,
  CodeIntelResult,
  ContextDetails,
  DisambiguationCandidate,
  HealthDetails,
  ImpactDetails,
  InspectDetails,
  ResolveDetails,
  SearchDetails,
  TestSurfaceDetails,
} from "./types.ts";
