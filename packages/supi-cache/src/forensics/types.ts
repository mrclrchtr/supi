// Forensics types — cross-session cache investigation data structures.

import type { RegressionCause } from "../monitor/state.ts";

/** A forensics cause extends runtime causes with the derived "idle" classification. */
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
  /** Human-only detail — stripped before returning to agent. */
  _pathsInvolved?: string[];
  /** Human-only detail — stripped before returning to agent. */
  _commandSummaries?: string[];
}

/** Tally of regression causes across scanned sessions. */
export interface CauseBreakdown {
  compaction: number;
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

/** Options for running a forensics query. */
export interface ForensicsOptions {
  pattern: "hotspots" | "breakdown" | "correlate" | "idle";
  since: string;
  minDrop?: number;
  maxSessions?: number;
  lookback?: number;
  idleThresholdMinutes?: number;
  /** Percentage-point drop threshold for classifying unknown-cause drops. Default: 25 */
  regressionThreshold?: number;
}
