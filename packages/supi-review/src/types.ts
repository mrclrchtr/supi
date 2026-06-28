import type { Model } from "@earendil-works/pi-ai";
import type { ModelRegistry } from "@earendil-works/pi-coding-agent";

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

export type ReviewItemCategory =
  | "correctness"
  | "security"
  | "performance"
  | "api"
  | "test-gap"
  | "docs"
  | "cleanup"
  | "maintainer";

export type ReviewItemImpact = "low" | "medium" | "high";
export type ReviewItemEffort = "low" | "medium" | "high";
export type ReviewItemRecommendedAction = "must-fix" | "should-fix" | "consider";
export type ReviewOverallCorrectness = "PATCH IS CORRECT" | "PATCH HAS ISSUES";

/** Structured review item returned by the reviewer session. */
export interface ReviewItem {
  title: string;
  body: string;
  category: ReviewItemCategory;
  impact: ReviewItemImpact;
  effort: ReviewItemEffort;
  recommended_action: ReviewItemRecommendedAction;
  confidence_score: number;
  suggested_fix: string;
  verification_hint: string;
  code_location?: ReviewCodeLocation;
}

/** Raw review payload submitted by the reviewer child session. */
export interface ReviewOutputEvent {
  items: ReviewItem[];
  overall_explanation: string;
  overall_confidence_score: number;
}

export interface ReviewSummary {
  actions: {
    mustFix: number;
    shouldFix: number;
    consider: number;
  };
  categories: Partial<Record<ReviewItemCategory, number>>;
}

/** Host-normalized review payload used for rendering and follow-up flow. */
export interface NormalizedReviewOutput extends ReviewOutputEvent {
  overall_correctness: ReviewOverallCorrectness;
  summary: ReviewSummary;
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
export type ReviewModelSelection = import("@mrclrchtr/supi-core/model-selection").ModelSelection;

/** Structured brief synthesized from the current session history. */
export type ReviewInstructionBlockId =
  | "public-surface"
  | "cross-layer"
  | "schema-widening"
  | "cleanup";

export interface SynthesizedReviewBrief {
  summary: string;
  intendedOutcome: string;
  constraints: string[];
  focusAreas: string[];
  riskyFiles: string[];
  unresolvedQuestions: string[];
  reviewInstructionBlockIds: ReviewInstructionBlockId[];
  note?: string;
}

/** Final prompt packet passed to the reviewer child session. */
export interface ReviewPacket {
  prompt: string;
  includedFiles: string[];
  omittedFiles: string[];
  charBudget: number;
}

/** Lightweight diagnostics attached to non-success review runs. */
export interface ReviewFailureDebugInfo {
  turns: number;
  toolUses: number;
  tokens?: {
    input: number;
    output: number;
    total: number;
    cacheRead?: number;
    cacheWrite?: number;
  };
  recentEvents?: string[];
  lastAssistantText?: string;
  lastAssistantStopReason?: string;
  lastAssistantErrorMessage?: string;
  lastAssistantToolCalls?: string[];
}

/** Fully prepared review run. */
export interface ReviewPlan {
  model: ReviewModelSelection;
  snapshot: ReviewSnapshot;
  brief: SynthesizedReviewBrief;
  packet: ReviewPacket;
}

/** Raw result of the review child session. */
export type RawReviewResult =
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
      debug?: ReviewFailureDebugInfo;
    }
  | {
      kind: "canceled";
      snapshot: ReviewSnapshot;
      brief?: SynthesizedReviewBrief;
      modelId: string;
      debug?: ReviewFailureDebugInfo;
    }
  | {
      kind: "timeout";
      snapshot: ReviewSnapshot;
      timeoutMs: number;
      partialOutput?: string;
      brief?: SynthesizedReviewBrief;
      modelId: string;
      debug?: ReviewFailureDebugInfo;
    };

/** Normalized result used by rendering and follow-up logic. */
export type ReviewResult =
  | {
      kind: "success";
      output: NormalizedReviewOutput;
      snapshot: ReviewSnapshot;
      brief?: SynthesizedReviewBrief;
      modelId: string;
    }
  | Extract<RawReviewResult, { kind: "failed" | "canceled" | "timeout" }>;

/** Progress state exposed by review/synthesis runners for widget integration. */
export interface ReviewProgress {
  /** Number of agent turns completed. */
  turns: number;
  /** Number of tool executions started. */
  toolUses: number;
  /** Token usage stats, if available. */
  tokens?: {
    input: number;
    output: number;
    total: number;
    cacheRead?: number;
    cacheWrite?: number;
  };
  /** Per-tool execution counts keyed by short display label (e.g. "diffs", "reads", "greps"). */
  toolCounts?: Record<string, number>;
  /** Number of distinct files inspected so far (via read_snapshot_diff / read_snapshot_file). */
  filesInspected?: number;
  /** Total files in the review snapshot. */
  filesTotal?: number;
  /** Current tool + context for the progress narrative line. */
  currentFocus?: { label: string; detail: string };
  /** Elapsed time in milliseconds since the operation started. */
  elapsedMs?: number;
}

export type BriefSynthesisRunResult =
  | { kind: "success"; brief: SynthesizedReviewBrief }
  | { kind: "failed"; reason: string }
  | { kind: "canceled" }
  | { kind: "timeout"; timeoutMs: number };

export interface BriefSynthesisInvocation {
  prompt: string;
  // biome-ignore lint/suspicious/noExplicitAny: Model<any> is pi's canonical type
  model: Model<any>;
  modelRegistry?: ModelRegistry;
  cwd: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  onProgress?: (progress: ReviewProgress) => void;
}

export interface ReviewInvocation {
  prompt: string;
  model: ReviewModelSelection;
  modelRegistry?: ModelRegistry;
  cwd: string;
  signal?: AbortSignal;
  snapshot: ReviewSnapshot;
  brief: SynthesizedReviewBrief;
  timeoutMs?: number;
  onToolActivity?: (event: { toolName: string; phase: "start" | "end" }) => void;
  onProgress?: (progress: ReviewProgress) => void;
}
