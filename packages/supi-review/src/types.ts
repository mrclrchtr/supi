import type { Model } from "@earendil-works/pi-ai";

/** Inclusive 1-based line range reported by the reviewer. */
export interface ReviewLineRange {
  start: number;
  end: number;
}

/** File location reported by the reviewer. */
export interface ReviewCodeLocation {
  absolute_file_path: string;
  line_range: ReviewLineRange;
}

/** Structured finding returned by the reviewer session. */
export interface ReviewFinding {
  title: string;
  body: string;
  confidence_score: number;
  priority: 0 | 1 | 2 | 3;
  code_location: ReviewCodeLocation;
}

/** Final review payload submitted by the reviewer child session. */
export interface ReviewOutputEvent {
  findings: ReviewFinding[];
  overall_correctness: string;
  overall_explanation: string;
  overall_confidence_score: number;
}

/** User-selected review target. */
export type ReviewTargetSpec =
  | { kind: "working-tree" }
  | { kind: "branch"; base: string }
  | { kind: "commit"; sha: string };

/** Diff statistics for a resolved snapshot. */
export interface DiffStats {
  files: number;
  additions: number;
  deletions: number;
}

/** Concrete git snapshot resolved before synthesis/review starts. */
export interface ReviewSnapshot {
  target: ReviewTargetSpec;
  title: string;
  changedFiles: string[];
  diffText: string;
  stats: DiffStats;
}

/** Model picked explicitly for the current review run. */
export interface ReviewModelSelection {
  canonicalId: string;
  provider: string;
  id: string;
  // biome-ignore lint/suspicious/noExplicitAny: Model<any> is pi's canonical type
  model: Model<any>;
  label: string;
  description?: string;
  isCurrent: boolean;
}

/** Structured brief synthesized from the current session history. */
export interface SynthesizedReviewBrief {
  summary: string;
  intendedOutcome: string;
  constraints: string[];
  focusAreas: string[];
  riskyFiles: string[];
  unresolvedQuestions: string[];
  note?: string;
}

/** Final prompt packet passed to the reviewer child session. */
export interface ReviewPacket {
  prompt: string;
}

/** Fully prepared review run. */
export interface ReviewPlan {
  model: ReviewModelSelection;
  snapshot: ReviewSnapshot;
  brief: SynthesizedReviewBrief;
  packet: ReviewPacket;
}

/** Result of the review child session. */
export type ReviewResult =
  | {
      kind: "success";
      output: ReviewOutputEvent;
      snapshot: ReviewSnapshot;
      brief?: SynthesizedReviewBrief;
      modelId: string;
    }
  | {
      kind: "failed";
      reason: string;
      snapshot: ReviewSnapshot;
      brief?: SynthesizedReviewBrief;
      modelId: string;
    }
  | {
      kind: "canceled";
      snapshot: ReviewSnapshot;
      brief?: SynthesizedReviewBrief;
      modelId: string;
    }
  | {
      kind: "timeout";
      snapshot: ReviewSnapshot;
      timeoutMs: number;
      partialOutput?: string;
      brief?: SynthesizedReviewBrief;
      modelId: string;
    };
