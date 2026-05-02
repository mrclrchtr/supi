// Per-turn cache state management, regression detection, and session persistence.

import type { SessionEntry } from "@mariozechner/pi-coding-agent";

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
  private lastPromptHash: number | undefined;
  private promptChangeFlag = false;

  // ── Turn recording ────────────────────────────────────────

  /**
   * Record a turn from assistant message usage data.
   * Returns the created TurnRecord (for persistence).
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
    let note: string | undefined;
    if (isFirstTurn) {
      note = "cold start";
    } else if (this.compactionFlag) {
      note = "⚠ compaction";
    } else if (this.modelChangeFlag) {
      note = "⚠ model changed";
    } else if (this.promptChangeFlag) {
      note = "⚠ prompt changed";
    }

    const record: TurnRecord = {
      turnIndex: this.nextTurnIndex++,
      cacheRead,
      cacheWrite,
      input,
      hitRate,
      timestamp,
      ...(note ? { note } : {}),
    };

    this.turns.push(record);

    // Clear one-shot cause flags after recording
    this.compactionFlag = false;
    this.modelChangeFlag = undefined;
    this.promptChangeFlag = false;

    return record;
  }

  // ── Cause-tracking methods ────────────────────────────────

  /** Flag that a compaction occurred (consumed on next recordTurn). */
  flagCompaction(): void {
    this.compactionFlag = true;
  }

  /** Flag that the model changed (consumed on next recordTurn). */
  flagModelChange(model: string): void {
    this.modelChangeFlag = model;
  }

  /**
   * Update the system prompt hash. If it differs from the previous hash,
   * flag a prompt change (consumed on next recordTurn).
   */
  updatePromptHash(hash: number): void {
    if (this.lastPromptHash !== undefined && hash !== this.lastPromptHash) {
      this.promptChangeFlag = true;
    }
    this.lastPromptHash = hash;
  }

  // ── Regression detection ──────────────────────────────────

  /**
   * Detect a cache regression comparing the latest two turns.
   * Skips turns with undefined hitRate. Returns null if no regression.
   */
  detectRegression(threshold: number): RegressionResult {
    // Need at least 2 turns with defined hitRate
    const withRate = this.turns.filter((t) => t.hitRate !== undefined);
    if (withRate.length < 2) return null;

    const current = withRate[withRate.length - 1];
    const previous = withRate[withRate.length - 2];
    const currentRate = current.hitRate as number;
    const previousRate = previous.hitRate as number;
    const drop = previousRate - currentRate;

    if (drop <= threshold) return null;

    // Diagnose cause from the note on the current turn
    let cause: RegressionCause;
    if (current.note === "⚠ compaction") {
      cause = { type: "compaction" };
    } else if (current.note === "⚠ model changed") {
      cause = { type: "model_change", model: this.getLastModelChange() ?? "unknown" };
    } else if (current.note === "⚠ prompt changed") {
      cause = { type: "prompt_change" };
    } else {
      cause = { type: "unknown" };
    }

    return { previousRate, currentRate, cause };
  }

  private getLastModelChange(): string | undefined {
    for (let i = this.turns.length - 1; i >= 0; i--) {
      if (this.turns[i].note === "⚠ model changed") {
        // Return the model info from the flag that was set when this turn was recorded
        // We don't store the model string in the turn, so return undefined for restored turns
        return undefined;
      }
    }
    return undefined;
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
    this.lastPromptHash = undefined;
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
    this.lastPromptHash = undefined;
    this.promptChangeFlag = false;
  }
}
