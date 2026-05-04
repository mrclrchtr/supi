// Shared types used by the rich overlay rendering pipeline.
// Extracted to avoid import cycles between render modules.

export type SubMode = "select" | "other-input" | "text-input" | "discuss-input" | "note-input";

export interface OverlayRenderState {
  selectedIndex: number;
  subMode: SubMode;
  stagedSelections: Map<string, number[]>;
  stagedSingleNotes: Map<string, string>;
  stagedMultiNotes: Map<string, Map<number, string>>;
}
