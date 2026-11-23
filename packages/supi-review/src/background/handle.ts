import { randomUUID } from "node:crypto";
import type { RunBatchHandle } from "@mrclrchtr/supi-agent-runtime/api";
import type { CompletedReviewOutcome } from "../tool/review_run/result.ts";
import { executePreparedReview, type PreparedReview } from "../tool/review_run/workflow.ts";
import type { ReviewMode, ReviewTaskResult } from "../types.ts";

/** Identity of one Review Task in a Background Review. */
export interface ReviewBatchTask {
  readonly taskId: string;
  readonly mode: ReviewMode;
}

/** Runtime handle of one Background Review: its Reviewer Runs and their results. */
export interface ReviewBatchHandle extends RunBatchHandle<ReviewTaskResult> {
  readonly tasks: readonly ReviewBatchTask[];
  /** Settles with the complete Review after every task is terminal and the workspace is removed. */
  readonly result: Promise<CompletedReviewOutcome>;
  /** The complete Review, once {@link result} resolved. */
  outcome(): CompletedReviewOutcome | undefined;
}

/** Session controls for one started Background Review. */
export interface StartReviewBatchOptions {
  /** Stops the Reviewer Sessions, like {@link ReviewBatchHandle.stop}; the session close signal. */
  readonly signal?: AbortSignal;
  /** Called with the batch ID each time a Review Task reaches its result. */
  onTaskResult(batchId: string): void;
}

/**
 * Start the Reviewer Sessions of a prepared Review without waiting for them. The Review Workspace
 * is removed once every task is terminal, before `result` settles.
 */
export function startReviewBatch(
  prepared: PreparedReview,
  options: StartReviewBatchOptions,
): ReviewBatchHandle {
  const batchId = randomUUID();
  const tasks = prepared.review.tasks.map((task) => ({ taskId: task.id, mode: task.mode }));
  const runKeys = new Map(tasks.map((task) => [task.taskId, randomUUID()]));
  const finished = new Map<string, ReviewTaskResult>();
  const abort = new AbortController();
  const stopSignal = options.signal
    ? AbortSignal.any([abort.signal, options.signal])
    : abort.signal;
  let outcome: CompletedReviewOutcome | undefined;
  const result = executePreparedReview(prepared, {
    signal: stopSignal,
    batch: {
      batchId,
      runKeys,
      onTaskResult: (taskResult) => {
        finished.set(taskResult.taskId, taskResult);
        options.onTaskResult(batchId);
      },
    },
  }).then((completed) => {
    outcome = completed;
    return completed;
  });
  let stopping: Promise<void> | undefined;
  return {
    batchId,
    runKeys,
    tasks,
    result,
    outcome: () => outcome,
    snapshot: () => ({
      results: tasks.flatMap((task) => finished.get(task.taskId) ?? []),
    }),
    stop: () => {
      if (!stopping) {
        abort.abort();
        stopping = result.then(
          () => undefined,
          () => undefined,
        );
      }
      return stopping;
    },
  };
}
