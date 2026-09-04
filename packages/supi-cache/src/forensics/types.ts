// Forensics types — cross-session cache investigation data structures.

import type { RegressionCause } from "./turns.ts";

/** A forensics cause extends cache causes with the derived "idle" classification. */
export type ForensicsCause = RegressionCause | { type: "idle"; idleGapMinutes: number };

/** A single finding from a regression turn across any session. */
export interface ForensicsFinding {
  sessionId: string;
  turnIndex: number;
  previousRate: number | undefined;
  currentRate: number | undefined;
  drop: number;
  cause: ForensicsCause;
  toolsBefore: ToolCallShape[];
  /** Inter-turn gap in minutes (computed during extraction, used by idle detection). */
  idleGapMinutes?: number;
  /** Prompt tokens that Pi could not read from the cache. */
  missedTokens?: number;
  /** Estimated extra cost for the missed tokens. */
  missedCost?: number;
  /** True when the provider/model changed before this request. */
  modelChanged?: boolean;
  /** Human-only detail — stripped before returning to agent. */
  _pathsInvolved?: string[];
  /** Human-only detail — stripped before returning to agent. */
  _commandSummaries?: string[];
}

/** Tally of regression causes across scanned sessions. */
export interface CauseBreakdown {
  compaction: number;
  branch_summary: number;
  model_change: number;
  prompt_change: number;
  unknown: number;
  idle: number;
}

/** Structural fingerprint of a tool call (no raw content). */
export interface ToolCallShape {
  toolName: string;
  paramKeys: string[];
  paramShapes: Record<string, ParamShape>;
}

/** Shape descriptor for a single parameter value. */
export type ParamShape =
  | { kind: "string"; len: number; multiline: boolean }
  | { kind: "number" }
  | { kind: "boolean" }
  | { kind: "object"; keyCount: number }
  | { kind: "array"; len: number };

/** Default maximum number of findings returned by list-style queries. */
export const DEFAULT_FINDINGS_LIMIT = 50;

/** Hard maximum number of findings accepted by list-style queries. */
export const MAX_FINDINGS_LIMIT = 200;

/** Normalize a user-provided findings limit to the supported range. */
export function normalizeFindingsLimit(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return DEFAULT_FINDINGS_LIMIT;
  return Math.min(MAX_FINDINGS_LIMIT, Math.max(1, Math.trunc(value)));
}

/** Options for running a forensics query. */
export interface ForensicsOptions {
  pattern: "hotspots" | "breakdown" | "correlate" | "idle";
  since: string;
  minDrop?: number;
  maxSessions?: number;
  maxFindings?: number;
  lookback?: number;
  idleThresholdMinutes?: number;
  /** Percentage-point drop threshold for classifying unknown-cause drops. Default: 25 */
  regressionThreshold?: number;
}
