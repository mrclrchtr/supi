// TypeScript interfaces for structured review output.

export interface ReviewLineRange {
  start: number;
  end: number;
}

export interface ReviewCodeLocation {
  absolute_file_path: string;
  line_range: ReviewLineRange;
}

export interface ReviewFinding {
  title: string;
  body: string;
  confidence_score: number;
  priority: 0 | 1 | 2 | 3;
  code_location: ReviewCodeLocation;
}

export interface ReviewOutputEvent {
  findings: ReviewFinding[];
  overall_correctness: string;
  overall_explanation: string;
  overall_confidence_score: number;
}

export type ReviewTarget =
  | { type: "base-branch"; branch: string; diff: string; changedFiles?: string[] }
  | { type: "uncommitted"; diff: string; changedFiles?: string[] }
  | { type: "commit"; sha: string; show: string; changedFiles?: string[] }
  | { type: "custom"; instructions: string; changedFiles?: string[] };

// ── Review modes and profiles ───────────────────────────────

/** Standard vs dynamic review mode. */
export type ReviewMode = "standard" | "dynamic";

/**
 * A review profile definition for standard reviews.
 * Each profile provides a named set of review focus areas
 * and optional system prompt guidance for the reviewer session.
 */
export interface ReviewProfile {
  id: string;
  label: string;
  description: string;
  /**
   * Additional system-prompt guidance injected into the
   * reviewer child session for this type of review.
   */
  systemPrompt: string;
}

/**
 * A review brief captures what the user wants the reviewer to examine.
 * It is assembled before the child reviewer session starts and
 * influences both the prompt and the final result rendering.
 */
export interface ReviewBrief {
  mode: ReviewMode;
  /** Human-readable title for the review (e.g. "Review: auth middleware"). */
  title: string;
  /** Summary of what changed (dynamic) or profile description (standard). */
  summary: string;
  /** Intended outcome of the change being reviewed. */
  intent: string;
  /** Focus areas or risk areas for the reviewer to examine. */
  focus: string;
  /** Profile id when mode === "standard", undefined otherwise. */
  profileId?: string;
  /** The assembled final prompt text sent to the reviewer. */
  finalPrompt: string;
}

export interface ReviewSettings {
  reviewModel: string;
  maxDiffBytes: number;
  autoFix: boolean;
}

export type ReviewResult =
  | { kind: "success"; output: ReviewOutputEvent; target: ReviewTarget; brief?: ReviewBrief }
  | { kind: "failed"; reason: string; target: ReviewTarget; brief?: ReviewBrief }
  | { kind: "canceled"; target: ReviewTarget; brief?: ReviewBrief }
  | {
      kind: "timeout";
      target: ReviewTarget;
      timeoutMs: number;
      partialOutput?: string;
      brief?: ReviewBrief;
    };
