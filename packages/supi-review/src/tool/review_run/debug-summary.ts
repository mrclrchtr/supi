import { recordDebugEvent } from "@mrclrchtr/supi-core/debug";
import type {
  ReviewerExtensionSetStatus,
  ReviewMode,
  ReviewProgress,
  ReviewTaskResult,
} from "../../types.ts";

/** Lifecycle facts observed for one finished review task. */
export interface ReviewTaskDebugSummaryInput {
  taskId: string;
  mode: ReviewMode;
  targetTitle: string;
  packetBytes: number;
  durationMs: number;
  reviewerExtensionSetStatus: ReviewerExtensionSetStatus;
  /** Final observed child progress, when any was reported. */
  progress?: ReviewProgress;
  result: ReviewTaskResult;
}

function cacheHitRate(tokens: ReviewProgress["tokens"]): number | undefined {
  if (!tokens) return undefined;
  const cacheRead = tokens.cacheRead ?? 0;
  if (cacheRead === 0 && (tokens.cacheWrite ?? 0) === 0) return undefined;
  const denominator = cacheRead + tokens.input;
  return denominator > 0 ? Math.round((cacheRead / denominator) * 100) : undefined;
}

/**
 * Record one compact per-task Review Debug Summary event.
 *
 * Contains only trustworthy lifecycle, usage, outcome, and capability metrics:
 * no repository evidence, tool arguments, or inspected-resource claims.
 */
export function recordReviewTaskDebugSummary(input: ReviewTaskDebugSummaryInput): void {
  const { result } = input;
  const diagnostics = "diagnostics" in result ? result.diagnostics : undefined;
  const tokens = input.progress?.tokens ?? diagnostics?.tokens;
  const hitRate = cacheHitRate(tokens);
  const data = {
    taskId: input.taskId,
    mode: input.mode,
    targetTitle: input.targetTitle,
    modelId: result.modelId,
    packetBytes: input.packetBytes,
    durationMs: input.durationMs,
    status: result.status,
    reviewerExtensionSetStatus: input.reviewerExtensionSetStatus,
    ...(result.status === "completed" ? { verdict: result.verdict } : {}),
    ...(result.status === "failed" ? { failureCode: result.failureCode } : {}),
    ...(result.status === "timeout" ? { timeoutMs: result.timeoutMs } : {}),
    turns: input.progress?.turns ?? diagnostics?.turns ?? 0,
    toolUses: input.progress?.toolUses ?? diagnostics?.toolUses ?? 0,
    toolErrors: input.progress?.toolErrors ?? 0,
    ...(tokens ? { usage: tokens } : {}),
    ...(hitRate !== undefined ? { cacheHitRate: hitRate } : {}),
    ...(result.capabilityWarnings
      ? { capabilityWarnings: result.capabilityWarnings.map((warning) => warning.message) }
      : {}),
  };
  recordDebugEvent({
    source: "supi-review",
    level: result.status === "completed" ? "info" : "warning",
    category: "review-task",
    message: `Review task ${input.taskId} ${result.status === "completed" ? result.verdict : result.status}`,
    data,
  });
}
