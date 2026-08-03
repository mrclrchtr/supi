// ── Tool names and routing ─────────────────────────────────────────────

export {
  CODE_INTELLIGENCE_TOOL_NAMES,
  type CodeIntelligenceToolName,
  type PlannerRoute,
} from "./tool-names.ts";

// ── Execution context and result ────────────────────────────────────────

export type { CodeIntelResult, CodeIntelToolExecCtx } from "./execution.ts";

// ── Detail types ────────────────────────────────────────────────────────

export type {
  AnchoredResolutionMetadata,
  AnchoredResolutionSource,
  ContextDetails,
  DisambiguationCandidate,
  HealthDetails,
  HealthSectionDetails,
  InspectDetails,
  OrientationSectionDetails,
  ResolveDetails,
  SearchDetails,
} from "../tool/result/types.ts";
