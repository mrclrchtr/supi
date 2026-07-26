import type { Model } from "@earendil-works/pi-ai";
import type { ChildLifecycleTrace } from "./tool/child-lifecycle-trace.ts";

/** Closed, host-owned classification for a managed child failure. */
export type ChildFailureCode =
  | "session-creation-failed"
  | "prompt-rejected"
  | "missing-structured-output"
  | "unexpected-runner-failure";

/** Managed child role used for host-owned failure copy. */
export type ChildStage = "brief-synthesis" | "reviewer";

/** Failed child result fields with diagnostics required exactly when a child was observed. */
export type ChildFailedResult =
  | { failureCode: "session-creation-failed"; diagnostics?: never }
  | {
      failureCode: Exclude<ChildFailureCode, "session-creation-failed">;
      diagnostics: ChildFailureDiagnostics;
    };

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

/** Snapshot metadata safe to retain without duplicating bulk diff text. */
export type ReviewSnapshotSummary = Omit<ReviewSnapshot, "diffText">;

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

/** Brief field evaluated by the main agent before reviewer sessions run. */
export type ReviewBriefField =
  | "summary"
  | "intendedOutcome"
  | "constraints"
  | "focusAreas"
  | "riskyFiles"
  | "unresolvedQuestions"
  | "reviewInstructionBlockIds";

/** Class of defect identified in a generated review brief. */
export type BriefCritiqueFindingKind =
  | "omission"
  | "unsupported-inference"
  | "misprioritized"
  | "unclear";

/** One evidence-backed main-agent criticism of a generated review brief. */
export interface BriefCritiqueFinding {
  kind: BriefCritiqueFindingKind;
  field: ReviewBriefField;
  explanation: string;
  evidence: string;
  proposedChange: string;
}

/** Structured quality gate completed by the main agent before review execution. */
export interface BriefCritique {
  verdict: "accept" | "revise";
  summary: string;
  findings: BriefCritiqueFinding[];
}

/** One independent reviewer child-session assignment. */
export interface ReviewerAssignment {
  id: string;
  focus: string;
}

/** Generated/effective brief pair retained for synthesis-prompt evaluation. */
export interface BriefEvaluation {
  planId: string;
  briefPromptVersion: string;
  generatedBrief: SynthesizedReviewBrief;
  critique: BriefCritique;
  effectiveBrief: SynthesizedReviewBrief;
  synthesizerModelId: string;
  snapshotFingerprint: string;
}

/** Normalized reviewer result without repeated snapshot or brief payloads. */
export type AgentReviewerResult =
  | {
      kind: "success";
      output: NormalizedReviewOutput;
      modelId: string;
    }
  | ({ kind: "failed"; modelId: string } & ChildFailedResult)
  | {
      kind: "canceled";
      modelId: string;
      diagnostics: ChildFailureDiagnostics;
    }
  | {
      kind: "timeout";
      timeoutMs: number;
      modelId: string;
      diagnostics: ChildFailureDiagnostics;
    };

/** One normalized result from a focused reviewer child session. */
export interface ReviewerAssignmentResult {
  assignment: ReviewerAssignment;
  result: AgentReviewerResult;
}

/** Structured details retained on a completed agent-driven review batch. */
export interface AgentReviewBatchDetails {
  kind: "review-batch";
  evaluation: BriefEvaluation;
  snapshot: ReviewSnapshotSummary;
  results: ReviewerAssignmentResult[];
}

/** Structured details returned when an agent-driven review plan is prepared. */
export interface PreparedAgentReviewDetails {
  kind: "review-prepared";
  planId: string;
  briefPromptVersion: string;
  generatedBrief: SynthesizedReviewBrief;
  snapshot: ReviewSnapshotSummary;
  snapshotFingerprint: string;
  modelId: string;
}

/** Final prompt packet passed to the reviewer child session. */
export interface ReviewPacket {
  prompt: string;
  includedFiles: string[];
  omittedFiles: string[];
  charBudget: number;
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
  | ({
      kind: "failed";
      snapshot: ReviewSnapshot;
      brief?: SynthesizedReviewBrief;
      modelId: string;
    } & ChildFailedResult)
  | {
      kind: "canceled";
      snapshot: ReviewSnapshot;
      brief?: SynthesizedReviewBrief;
      modelId: string;
      diagnostics: ChildFailureDiagnostics;
    }
  | {
      kind: "timeout";
      snapshot: ReviewSnapshot;
      timeoutMs: number;
      brief?: SynthesizedReviewBrief;
      modelId: string;
      diagnostics: ChildFailureDiagnostics;
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

/**
 * Safe bounded diagnostics attached only to a non-success managed child run.
 *
 * The trace and Recent Activity lane contain only allowlisted control metadata;
 * no child-generated text, caught error, or raw SDK event is retained.
 */
export interface ChildFailureDiagnostics {
  lifecycleTrace: ChildLifecycleTrace;
  turns: number;
  toolUses: number;
  tokens?: {
    input: number;
    output: number;
    total: number;
    cacheRead?: number;
    cacheWrite?: number;
  };
  recentActivity?: string[];
  lastAssistantStopReason?: string;
  lastAssistantToolCalls?: string[];
}

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
  | ({ kind: "failed" } & ChildFailedResult)
  | { kind: "canceled"; diagnostics: ChildFailureDiagnostics }
  | { kind: "timeout"; timeoutMs: number; diagnostics: ChildFailureDiagnostics };

export interface BriefSynthesisInvocation {
  prompt: string;
  // biome-ignore lint/suspicious/noExplicitAny: Model<any> is pi's canonical type
  model: Model<any>;
  cwd: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  onProgress?: (progress: ReviewProgress) => void;
}

export interface ReviewInvocation {
  prompt: string;
  model: ReviewModelSelection;
  cwd: string;
  signal?: AbortSignal;
  snapshot: ReviewSnapshot;
  brief: SynthesizedReviewBrief;
  timeoutMs?: number;
  onToolActivity?: (event: { toolName: string; phase: "start" | "end" }) => void;
  onProgress?: (progress: ReviewProgress) => void;
}
