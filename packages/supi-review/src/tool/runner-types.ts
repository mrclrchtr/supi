import type { Model } from "@earendil-works/pi-ai";
import type { ModelRegistry } from "@earendil-works/pi-coding-agent";
import type { ReviewModelSelection, ReviewSnapshot, SynthesizedReviewBrief } from "../types.ts";

/** Progress state exposed by review/synthesis runners for widget integration. */
export interface ReviewProgress {
  /** Number of agent turns completed. */
  turns: number;
  /** Number of tool executions started. */
  toolUses: number;
  /** Human-readable active tool descriptions. */
  activities: string[];
  /** Token usage stats, if available. */
  tokens?: { input: number; output: number; total: number };
}

export type BriefSynthesisRunResult =
  | { kind: "success"; brief: SynthesizedReviewBrief }
  | { kind: "failed"; reason: string }
  | { kind: "canceled" }
  | { kind: "timeout"; timeoutMs: number };

export interface BriefSynthesisInput {
  snapshot: ReviewSnapshot;
  evidence: Array<{ kind: string; reason: string; text: string }>;
  note?: string;
}

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
