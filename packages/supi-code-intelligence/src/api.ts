// Reusable architecture and target-resolution helpers for peer extensions.
// Canonical types and provider contracts for the code-understanding stack.

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
// Unified CodeProvider interface and registry
export type { CodeProvider } from "./provider/code-provider.ts";
export type { CodeProviderState } from "./provider/registry.ts";
export {
  clearCodeProvider,
  getCodeProvider,
  registerCodeProvider,
} from "./provider/registry.ts";
// Provider contracts
export type {
  SemanticProvider,
  StructuralProvider,
  StructuralResult,
} from "./provider/types.ts";
// Adapters removed in Phase 4 of the code-intelligence redesign.
// Use getCodeProvider from ./provider/registry.ts instead.
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
