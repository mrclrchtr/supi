import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { type RunBatch, readResultCollection } from "@mrclrchtr/supi-agent-runtime/api";
import type { PostReviewPolicy } from "../config.ts";
import type { ReviewBatchHandle } from "./handle.ts";

/** Custom message type of Background Review Completion Notices. */
export const REVIEW_COMPLETION_MESSAGE_TYPE = "supi-review-completion";

/** Review data kept with each Background Review. */
export interface ReviewBatchData {
  /** Post-Review Policy configured when the Review started; applied to the complete report. */
  readonly postReviewPolicy: PostReviewPolicy;
}

/** One session-owned Background Review. */
export type ReviewRunBatch = RunBatch<ReviewBatchHandle, ReviewBatchData>;

/**
 * Whether a Background Review still has results or Usage to collect: it is incomplete, or a
 * successful stored collection on the active branch is missing a task or its Usage receipt.
 */
export function reviewNeedsCollection(
  batch: ReviewRunBatch,
  branch: readonly SessionEntry[],
  usageReported: (taskId: string) => boolean,
): boolean {
  const { handle } = batch;
  if (!handle.outcome()) return true;
  const collected = new Set<string>();
  for (const entry of branch) {
    const result = readResultCollection(entry);
    if (result?.batchId === handle.batchId) for (const id of result.taskIds) collected.add(id);
  }
  return handle
    .snapshot()
    .results.some(
      (task) => !collected.has(task.taskId) || (task.usage && !usageReported(task.taskId)),
    );
}
