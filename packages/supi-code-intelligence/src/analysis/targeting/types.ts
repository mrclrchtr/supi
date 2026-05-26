/**
 * Targeting types — re-exported from the canonical targeting module.
 *
 * These are the same types used by src/targeting/* but exposed
 * through the analysis layer for consumers that import from
 * src/analysis/ instead of the legacy paths.
 */

export type {
  DisambiguationCandidateData,
  NormalizedQuery,
  ResolvedTargetData,
  ResolvedTargetGroupData,
  ResolverDeps,
  TargetOutcome,
} from "../../targeting/types.ts";
