// Package root exports for @mrclrchtr/supi-code-intelligence.
// Peer extensions can import these APIs for programmatic access.

export type {
  ArchitectureModel,
  DependencyEdge,
  ModuleInfo,
} from "@mrclrchtr/supi-code-runtime/api";
export {
  buildArchitectureModel,
  findModuleForPath,
  getDependencies,
  getDependents,
} from "@mrclrchtr/supi-code-runtime/api";

export { generateFocusedBrief, generateOverview, generateProjectBrief } from "./brief.ts";
export { createSemanticSubstrate } from "./substrates/lsp-adapter.ts";
export { createStructuralSubstrate } from "./substrates/tree-sitter-adapter.ts";

// Substrate adapters
export type {
  CalleesData,
  CodeSymbol,
  ExportData,
  ImportData,
  NodeAtData,
  OutlineData,
  SemanticSubstrate,
  StructuralResult,
  StructuralSubstrate,
} from "./substrates/types.ts";
export type { ResolvedTarget, TargetResolutionResult } from "./target-resolution.ts";
export {
  normalizePath,
  resolveAnchoredTarget,
  resolveSymbolTarget,
  toZeroBased,
} from "./target-resolution.ts";

export type {
  AffectedDetails,
  BriefDetails,
  CodeIntelResult,
  ConfidenceMode,
  DisambiguationCandidate,
  MapDetails,
  SearchDetails,
} from "./types.ts";
