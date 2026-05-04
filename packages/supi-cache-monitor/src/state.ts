// Per-turn cache state management, regression detection, and session persistence.

import type { SessionEntry } from "@mariozechner/pi-coding-agent";
import { diffFingerprints, type PromptFingerprint } from "./fingerprint.ts";

/** Persisted per-turn cache record. */
export interface TurnRecord {
  turnIndex: number;
  cacheRead: number;
  cacheWrite: number;
  input: number;
  /** Hit rate as 0–100, or undefined when cacheRead + input === 0. */
  hitRate: number | undefined;
  timestamp: number;
  /** Annotation for the report Note column. */
  note?: string;
  /** Structured cause metadata for later regression diagnosis. */
  cause?: RegressionCause;
  /** Fingerprint of the system prompt used for this turn, if available. */
  promptFingerprint?: PromptFingerprint;
}

/** Cause of a detected regression. */
export type RegressionCause =
  | { type: "compaction" }
  | { type: "model_change"; model: string }
  | { type: "prompt_change" }
  | { type: "unknown" };

/** Result of detectRegression() — null means no regression. */
export type RegressionResult = {
  previousRate: number;
  currentRate: number;
  cause: RegressionCause;
} | null;

/** Usage data extracted from an assistant message. */
export interface TurnUsage {
  cacheRead: number;
  cacheWrite: number;
  input: number;
}

/**
 * Manages per-turn cache metrics, cause-tracking flags, and regression detection.
 *
 * Designed to be instantiated once per session and reconstructed from
 * persisted session entries on resume.
 */
export class CacheMonitorState {
  private turns: TurnRecord[] = [];
  private nextTurnIndex = 1;

  /** Whether any turn ever reported non-zero cacheRead or cacheWrite. */
  cacheSupported = false;

  // ── Cause-tracking flags ──────────────────────────────────

  private compactionFlag = false;
  private modelChangeFlag: string | undefined;
  private lastPromptFingerprint: PromptFingerprint | undefined;
  private promptChangeFlag = false;

  // ── Turn recording ────────────────────────────────────────

  /**
   * Record a turn from assistant message usage data.
   * Returns the created TurnRecord (for persistence).
   *
   * Pending cause flags are only consumed by turns with a defined hitRate so
   * that provider/tooling gaps do not steal the attribution from the next
   * comparable cache-capable turn.
   */
  recordTurn(usage: TurnUsage, timestamp: number): TurnRecord {
    const { cacheRead, cacheWrite, input } = usage;
    const hasCacheMetrics = cacheRead > 0 || cacheWrite > 0;

    // hitRate is undefined when there are no cache metrics at all (provider
    // doesn't report cache tokens) or when the denominator is zero.
    let hitRate: number | undefined;
    if (hasCacheMetrics) {
      const denominator = cacheRead + input;
      hitRate = denominator === 0 ? undefined : Math.round((cacheRead / denominator) * 100);
    }

    if (hasCacheMetrics) {
      this.cacheSupported = true;
    }

    const isFirstTurn = this.turns.length === 0;
    const cause = !isFirstTurn && hitRate !== undefined ? this.getPendingCause() : undefined;
    const note = isFirstTurn ? "cold start" : cause ? formatCauseNote(cause) : undefined;

    const record: TurnRecord = {
      turnIndex: this.nextTurnIndex++,
      cacheRead,
      cacheWrite,
      input,
      hitRate,
      timestamp,
      ...(note ? { note } : {}),
      ...(cause ? { cause } : {}),
      ...(this.lastPromptFingerprint ? { promptFingerprint: this.lastPromptFingerprint } : {}),
    };

    this.turns.push(record);

    // Clear one-shot cause flags only after a comparable turn consumed them.
    if (hitRate !== undefined) {
      this.clearPendingCause();
    }

    return record;
  }

  // ── Cause-tracking methods ────────────────────────────────

  /** Flag that a compaction occurred (consumed on next comparable recordTurn). */
  flagCompaction(): void {
    this.compactionFlag = true;
  }

  /** Flag that the model changed (consumed on next comparable recordTurn). */
  flagModelChange(model: string): void {
    this.modelChangeFlag = model;
  }

  /**
   * Store the computed prompt fingerprint. If it differs from the previous
   * fingerprint, flag a prompt change (consumed on next comparable recordTurn).
   */
  updatePromptFingerprint(fp: PromptFingerprint): void {
    if (this.lastPromptFingerprint !== undefined) {
      const diffs = diffFingerprints(this.lastPromptFingerprint, fp);
      if (diffs.length > 0) {
        this.promptChangeFlag = true;
      }
    }
    this.lastPromptFingerprint = fp;
  }

  // ── Regression detection ──────────────────────────────────

  /**
   * Detect a cache regression comparing the latest two adjacent turns.
   * Returns null if either turn lacks comparable cache data.
   */
  detectRegression(threshold: number): RegressionResult {
    const current = this.getLatestTurn();
    const previous = this.getPreviousTurn();
    if (!current || !previous) return null;
    if (current.hitRate === undefined || previous.hitRate === undefined) return null;

    const currentRate = current.hitRate;
    const previousRate = previous.hitRate;
    const drop = previousRate - currentRate;

    if (drop <= threshold) return null;

    return {
      previousRate,
      currentRate,
      cause: getTurnCause(current) ?? { type: "unknown" },
    };
  }

  private getPendingCause(): RegressionCause | undefined {
    if (this.compactionFlag) {
      return { type: "compaction" };
    }
    if (this.modelChangeFlag) {
      return { type: "model_change", model: this.modelChangeFlag };
    }
    if (this.promptChangeFlag) {
      return { type: "prompt_change" };
    }
    return undefined;
  }

  private clearPendingCause(): void {
    this.compactionFlag = false;
    this.modelChangeFlag = undefined;
    this.promptChangeFlag = false;
  }

  // ── Session persistence / restoration ─────────────────────

  /**
   * Reconstruct state from persisted session entries.
   * Filters for `type === "custom"` and `customType === "supi-cache-turn"`.
   */
  restoreFromEntries(entries: SessionEntry[]): void {
    this.turns = [];
    this.nextTurnIndex = 1;
    this.cacheSupported = false;
    this.compactionFlag = false;
    this.modelChangeFlag = undefined;
    this.lastPromptFingerprint = undefined;
    this.promptChangeFlag = false;

    for (const entry of entries) {
      if (entry.type === "custom" && entry.customType === "supi-cache-turn") {
        const data = entry.data as TurnRecord;
        this.turns.push(data);
        this.nextTurnIndex = data.turnIndex + 1;
        if (data.cacheRead > 0 || data.cacheWrite > 0) {
          this.cacheSupported = true;
        }
      }
    }

    // Restore last fingerprint from the most recently restored turn so that
    // cross-session prompt-change detection works correctly.
    const lastTurn = this.turns[this.turns.length - 1];
    if (lastTurn?.promptFingerprint) {
      this.lastPromptFingerprint = lastTurn.promptFingerprint;
    }
  }

  // ── Accessors ─────────────────────────────────────────────

  /** Get all recorded turns. */
  getTurns(): readonly TurnRecord[] {
    return this.turns;
  }

  /** Get the latest turn, or undefined if no turns recorded. */
  getLatestTurn(): TurnRecord | undefined {
    return this.turns.length > 0 ? this.turns[this.turns.length - 1] : undefined;
  }

  /** Get the previous turn (second-to-last), or undefined. */
  getPreviousTurn(): TurnRecord | undefined {
    return this.turns.length > 1 ? this.turns[this.turns.length - 2] : undefined;
  }

  /** Reset all state (e.g. on session shutdown). */
  reset(): void {
    this.turns = [];
    this.nextTurnIndex = 1;
    this.cacheSupported = false;
    this.compactionFlag = false;
    this.modelChangeFlag = undefined;
    this.lastPromptFingerprint = undefined;
    this.promptChangeFlag = false;
  }

  /** Get the latest prompt fingerprint (for diffing in regression messages). */
  getLatestFingerprint(): PromptFingerprint | undefined {
    return this.lastPromptFingerprint;
  }

  /** Get the previous turn's prompt fingerprint (for diffing in regression messages). */
  getPreviousFingerprint(): PromptFingerprint | undefined {
    const prev = this.getPreviousTurn();
    return prev?.promptFingerprint;
  }
}

function formatCauseNote(cause: RegressionCause): string {
  switch (cause.type) {
    case "compaction":
      return "⚠ compaction";
    case "model_change":
      return "⚠ model changed";
    case "prompt_change":
      return "⚠ prompt changed";
    default:
      return "";
  }
}

function getTurnCause(turn: TurnRecord): RegressionCause | undefined {
  if (turn.cause) {
    return turn.cause;
  }

  switch (turn.note) {
    case "⚠ compaction":
      return { type: "compaction" };
    case "⚠ model changed":
      return { type: "model_change", model: "unknown" };
    case "⚠ prompt changed":
      return { type: "prompt_change" };
    default:
      return undefined;
  }
}
