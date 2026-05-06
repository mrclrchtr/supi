// Shared types used by the rich overlay rendering pipeline.
// Extracted to avoid import cycles between render modules.

export type SubMode = "select" | "other-input" | "text-input" | "discuss-input" | "note-input";

export interface OverlayRenderState {
  /** Current cursor row index within the interactive rows list. */
  selectedIndex: number;
  /** Active input mode: select, text-input, other-input, discuss-input, note-input. */
  subMode: SubMode;
  /** Uncommitted multichoice checkbox state (questionId → sorted optionIndexes). */
  stagedSelections: Map<string, number[]>;
  /** Draft note text for single-select questions (questionId → note). */
  stagedSingleNotes: Map<string, string>;
  /** Draft note text per-option for multichoice questions (questionId → Map<optionIndex, note>). */
  stagedMultiNotes: Map<string, Map<number, string>>;
}
