// Shared types for code intelligence tool results and metadata.

import type { PrioritySignalsSummary } from "./prioritization-signals.ts";

/** Confidence vocabulary for result labeling. */
export type ConfidenceMode = "semantic" | "structural" | "heuristic" | "unavailable";

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

/** Tool result shape returned by executeAction. */
export interface CodeIntelResult {
  content: string;
  details?:
    | { type: "brief"; data: BriefDetails }
    | { type: "search"; data: SearchDetails }
    | { type: "affected"; data: AffectedDetails };
}
