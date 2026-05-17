// Reusable architecture and target-resolution helpers for peer extensions.

export type { ArchitectureModel, DependencyEdge, ModuleInfo } from "./architecture.ts";
export {
  buildArchitectureModel,
  findModuleForPath,
  getDependencies,
  getDependents,
} from "./architecture.ts";

export { generateFocusedBrief, generateOverview, generateProjectBrief } from "./brief.ts";
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
  SearchDetails,
} from "./types.ts";
