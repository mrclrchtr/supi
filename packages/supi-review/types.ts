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
  | { type: "base-branch"; branch: string; diff: string }
  | { type: "uncommitted"; diff: string }
  | { type: "commit"; sha: string; show: string }
  | { type: "custom"; instructions: string };

export type ReviewDepth = "inherit" | "fast" | "deep";

export interface ReviewSettings {
  reviewFastModel: string;
  reviewDeepModel: string;
  maxDiffBytes: number;
  reviewTimeoutMinutes: number;
  autoFix: boolean;
}

/** Session/debug metadata captured from the reviewer subprocess. */
export interface ReviewRunDiagnostics {
  sessionId?: string;
  sessionPath?: string;
  stdout?: string;
  stderr?: string;
}

export type ReviewResult =
  | {
      kind: "success";
      output: ReviewOutputEvent;
      target: ReviewTarget;
      sessionId?: string;
      sessionPath?: string;
    }
  | {
      kind: "failed";
      reason: string;
      stdout?: string;
      stderr?: string;
      target: ReviewTarget;
      sessionId?: string;
      sessionPath?: string;
    }
  | { kind: "canceled"; target: ReviewTarget; sessionId?: string; sessionPath?: string }
  | {
      kind: "timeout";
      target: ReviewTarget;
      timeoutMs: number;
      stdout?: string;
      stderr?: string;
      sessionId?: string;
      sessionPath?: string;
    };
