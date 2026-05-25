// ── Canonical shared types for the code-understanding stack ─────────────

/** 0-based LSP position. */
export interface CodePosition {
  line: number;
  character: number;
}

/** A source range spanning two CodePositions. */
export interface SourceRange {
  start: CodePosition;
  end: CodePosition;
}

/** A code location (file URI + range). */
export interface CodeLocation {
  uri: string;
  range: SourceRange;
}

/** A discovered symbol / declaration. */
export interface CodeSymbol {
  name: string;
  kind: string;
  file: string;
  line: number;
  character: number;
  container?: string | null;
}

/** Discriminated result union for provider operations. */
export type CodeResult<T> =
  | { kind: "success"; data: T }
  | { kind: "unsupported-language"; file: string; message: string }
  | { kind: "file-access-error"; file: string; message: string }
  | { kind: "validation-error"; message: string }
  | { kind: "runtime-error"; message: string }
  | { kind: "unavailable"; message: string };

/** Result confidence classification. */
export type ConfidenceMode = "semantic" | "structural" | "heuristic" | "unavailable";

/** Provider availability states. */
export type ProviderAvailability =
  | { kind: "pending" }
  | { kind: "ready" }
  | { kind: "disabled" }
  | { kind: "inactive" }
  | { kind: "unavailable"; reason: string };

// ── Structural data shapes (value types, range-flattened) ──────────────

export interface OutlineData {
  name: string;
  kind: string;
  startLine: number;
  startCharacter: number;
  endLine: number;
  endCharacter: number;
  children?: OutlineData[];
}

export interface ExportData {
  name: string;
  kind: string;
  startLine: number;
  startCharacter: number;
  endLine: number;
  endCharacter: number;
  moduleSpecifier?: string;
}

export interface ImportData {
  moduleSpecifier: string;
  startLine: number;
  startCharacter: number;
  endLine: number;
  endCharacter: number;
}

export interface NodeAtData {
  type: string;
  startLine: number;
  startCharacter: number;
  endLine: number;
  endCharacter: number;
  text: string;
  ancestry: Array<{
    type: string;
    startLine: number;
    startCharacter: number;
    endLine: number;
    endCharacter: number;
  }>;
}

export interface CalleesData {
  enclosingScope: { name: string; startLine: number; endLine: number };
  callees: Array<{ name: string; startLine: number }>;
}

// ── Existing code-intelligence types ──────────────────────────────────

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

/** Structured details metadata for factual map results. */
export interface MapDetails {
  scope: string | null;
  totalFiles: number;
  childDirectoryCount: number;
  landmarkCount: number;
  nextQueries: string[];
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
    | { type: "map"; data: MapDetails }
    | { type: "search"; data: SearchDetails }
    | { type: "affected"; data: AffectedDetails };
}
