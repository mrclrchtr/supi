// ── Canonical types (re-exported from the shared code-runtime) ─────────

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
  SourceRange,
} from "@mrclrchtr/supi-code-runtime/api";

// ── Code-intelligence-specific types ─────────────────────────────────

import type { ConfidenceMode } from "@mrclrchtr/supi-code-runtime/api";
import type { PrioritySignalsSummary } from "./prioritization-signals.ts";

/** Structured details metadata returned alongside markdown brief content. */
export interface BriefDetails {
  confidence: ConfidenceMode;
  focusTarget: string | null;
  startHere: Array<{ target: string; reason: string }>;
  publicSurfaces: string[];
  dependencySummary: { moduleCount: number; edgeCount: number } | null;
  omittedCount: number;
  nextQueries: string[];
  prioritySignals?: PrioritySignalsSummary | null;
}

/** Structured details metadata for relationship and pattern results. */
export interface SearchDetails {
  confidence: ConfidenceMode;
  scope: string | null;
  candidateCount: number;
  omittedCount: number;
  nextQueries: string[];
}

/** Structured details metadata for affected analysis results. */
export interface AffectedDetails {
  confidence: ConfidenceMode;
  directCount: number;
  downstreamCount: number;
  riskLevel: "low" | "medium" | "high";
  checkNext: string[];
  likelyTests: string[];
  omittedCount: number;
  nextQueries: string[];
  prioritySignals?: PrioritySignalsSummary | null;
}

/**
 * Structured details metadata for workflow-oriented impact analysis results.
 *
 * Currently structurally identical to `AffectedDetails`. When adding own fields,
 * audit callers in `generate-impact.ts` that construct `{ type: "impact", data }`
 * so they return `ImpactDetails`, not just `AffectedDetails`.
 */
export interface ImpactDetails extends AffectedDetails {}

/** Disambiguation candidate for ambiguous symbol resolution. */
export interface DisambiguationCandidate {
  name: string;
  kind: string | null;
  container: string | null;
  file: string;
  line: number;
  character: number;
  reason: string;
  rank: number;
}

/** Structured details metadata for code_resolve results. */
export interface ResolveDetails {
  confidence: ConfidenceMode;
  targetCount: number;
  omittedCount: number;
  targets: Array<{
    targetId: string;
    spanId: string;
    file: string;
    displayLine: number;
    displayCharacter: number;
    name: string | null;
    kind: string | null;
    confidence: ConfidenceMode;
    provenance: string;
  }>;
  candidates?: Array<{
    targetId: string;
    name: string;
    kind: string | null;
    container: string | null;
    file: string;
    line: number;
    character: number;
    reason: string;
    rank: number;
  }>;
  nextQueries: string[];
}

/** Structured details metadata for code_context results. */
export interface ContextDetails {
  confidence: ConfidenceMode;
  task: string | null;
  focusTarget: string | null;
  requestedSections: string[];
  renderedSections: string[];
  omittedCount: number;
  nextQueries: string[];
}

/** Structured details metadata for code_health results. */
export interface HealthDetails {
  lspAvailable: boolean;
  lspStatus: string;
  recovered: boolean;
  diagnosticFileCount: number;
  serverCount: number;
}

/** Tool result shape returned by executeAction. */
export interface CodeIntelResult {
  content: string;
  details?:
    | { type: "brief"; data: BriefDetails }
    | { type: "context"; data: ContextDetails }
    | { type: "search"; data: SearchDetails }
    | { type: "impact"; data: ImpactDetails }
    | { type: "affected"; data: AffectedDetails }
    | { type: "resolve"; data: ResolveDetails }
    | { type: "health"; data: HealthDetails };
}
