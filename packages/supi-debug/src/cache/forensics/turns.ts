// Normalized cache observations used by history and forensics.

import type { PromptFingerprint } from "../fingerprint.ts";

/** Persisted or derived cache data for one assistant request. */
export interface CacheTurn {
  /** Position of the assistant request in the selected branch. */
  turnIndex: number;
  cacheRead: number;
  cacheWrite: number;
  input: number;
  /** Hit rate as 0–100, or undefined when cache support is unknown. */
  hitRate: number | undefined;
  /** Assistant message time in Unix milliseconds. */
  timestamp: number;
  /** Annotation for the history report. */
  note?: string;
  /** Cause recorded by the old live monitor or derived from native entries. */
  cause?: RegressionCause;
  /** Old monitor data for prompt-change details. */
  promptFingerprint?: PromptFingerprint;
  /** Prompt tokens that Pi could not read from the cache, when derived. */
  missedTokens?: number;
  /** Estimated additional cost for the missed tokens, when available. */
  missedCost?: number;
  /** Milliseconds since the previous request in the same cache segment. */
  idleMs?: number;
  /** Whether the model changed since the previous request. */
  modelChanged?: boolean;
  /** True when a compaction or branch summary reset cache comparison. */
  cacheReset?: boolean;
}

/** Legacy name retained for old persisted record readers and local callers. */
export type TurnRecord = CacheTurn;

/** Cause of a cache event or regression. */
export type RegressionCause =
  | { type: "compaction" }
  | { type: "branch_summary" }
  | { type: "model_change"; model: string }
  | { type: "prompt_change" }
  | { type: "unknown" };

/** Shared note labels used by old persisted cache records. */
export const CAUSE_NOTE = {
  compaction: "\u26a0 compaction",
  branch_summary: "\u26a0 branch summary",
  model_change: "\u26a0 model changed",
  prompt_change: "\u26a0 prompt changed",
} as const;

/** Format a known cause for the old history note column. */
export function formatCauseNote(cause: RegressionCause): string {
  switch (cause.type) {
    case "compaction":
      return CAUSE_NOTE.compaction;
    case "branch_summary":
      return CAUSE_NOTE.branch_summary;
    case "model_change":
      return CAUSE_NOTE.model_change;
    case "prompt_change":
      return CAUSE_NOTE.prompt_change;
    default:
      return "";
  }
}

/**
 * Resolve a turn cause, including note-based data from old sessions.
 *
 * Old monitor records stored a note but did not always store structured cause
 * data. The fallback keeps those records useful after migration.
 */
export function resolveTurnCause(turn: CacheTurn): RegressionCause | undefined {
  if (turn.cause) return turn.cause;

  switch (turn.note) {
    case CAUSE_NOTE.compaction:
      return { type: "compaction" };
    case CAUSE_NOTE.branch_summary:
      return { type: "branch_summary" };
    case CAUSE_NOTE.model_change:
      return { type: "model_change", model: "unknown" };
    case CAUSE_NOTE.prompt_change:
      return { type: "prompt_change" };
    default:
      return undefined;
  }
}
