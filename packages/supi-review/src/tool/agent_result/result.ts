import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import type { CompletionNotice } from "@mrclrchtr/supi-agent-runtime/api";
import type { ReviewRunBatch } from "../../background/batch.ts";
import type { ReviewBatchHandle } from "../../background/handle.ts";
import type { ReviewArtifactStore } from "../../session/review-artifact-store.ts";
import type { ReviewTaskResult } from "../../types.ts";
import { createReviewOutput } from "../output-page.ts";
import { formatReviewBatch } from "../review_run/format.ts";
import { buildRunResult } from "../review_run/result.ts";

/**
 * Review's `agent_result` results for Background Reviews: collections, `wait` progress, and the
 * Completion Notice. The runtime owns the tool; Review supplies these results as batch owner.
 */

/** Note on every collected report: findings describe the frozen state, not the live checkout. */
export const REVIEWED_STATE_NOTE =
  "Reviewed state: the frozen Review Workspace in the receipt above. The live checkout may differ since the Review started; check each finding against it before acting.";

/** Build the single Completion Notice of a Review: identifiers and terminal status only. */
export function buildReviewCompletionNotice(
  batchId: string,
  tasks: readonly ReviewTaskResult[],
): CompletionNotice {
  return {
    content: `Background Review ${batchId} finished: ${tasks.map((task) => `${JSON.stringify(task.taskId)} ${task.status}`).join(", ")}. Collect the report with agent_result.`,
    display: true,
    details: {
      batchId,
      taskIds: tasks.map((task) => task.taskId),
      tasks: tasks.map(({ taskId, mode, status }) => ({ taskId, mode, status })),
    } as CompletionNotice["details"],
  };
}

/** Per-task state of a Background Review: the finished status, else `running`. */
function reviewTaskStates(handle: ReviewBatchHandle) {
  const finished = handle.snapshot().results;
  return handle.tasks.map((task) => {
    const result = finished.find((candidate) => candidate.taskId === task.taskId);
    return { taskId: task.taskId, mode: task.mode, status: result?.status ?? "running" };
  });
}

function stillRunningLine(handle: ReviewBatchHandle): string {
  const states = reviewTaskStates(handle);
  return `Background Review ${handle.batchId} is still running: ${states.map((task) => `${task.taskId} (${task.status})`).join(", ")}. The Post-Review Policy applies only to the complete report: wait for the Completion Notice or use wait: true; do not poll.`;
}

/** Status-only `agent_result` progress while a `wait: true` collection blocks. */
export function reviewBatchProgress(
  batch: ReviewRunBatch,
): AgentToolResult<Record<string, unknown>> {
  const { handle } = batch;
  return {
    content: [{ type: "text", text: stillRunningLine(handle) }],
    details: { batchId: handle.batchId, complete: false, taskStates: reviewTaskStates(handle) },
  };
}

/**
 * Assemble one Background Review collection. A complete Review returns the Foreground Review
 * report, with the reviewed-state note and the Post-Review Policy. Before completion, the result
 * reports the finished task results beside the running tasks and omits the policy. Each collection
 * stores its report as a new Review Output Artifact, so a late collection still pages.
 */
export function collectReviewBatch(
  artifactStore: ReviewArtifactStore,
  batch: ReviewRunBatch,
): AgentToolResult<Record<string, unknown>> {
  const { handle } = batch;
  const outcome = handle.outcome();
  if (outcome) {
    const result = buildRunResult(artifactStore, outcome, batch.data.postReviewPolicy, {
      reviewedStateNote: REVIEWED_STATE_NOTE,
    });
    return {
      content: result.content,
      details: {
        ...result.details,
        batchId: handle.batchId,
        complete: true,
        tasks: outcome.details.results.map(({ taskId, status }) => ({ taskId, status })),
      },
    };
  }
  const details = handle.partialDetails();
  const output = createReviewOutput(
    artifactStore,
    formatReviewBatch(details, { reviewedStateNote: REVIEWED_STATE_NOTE, running: true }),
  );
  return {
    content: [{ type: "text", text: `${stillRunningLine(handle)}\n\n${output.text}` }],
    details: {
      ...details,
      output: output.reference,
      batchId: handle.batchId,
      complete: false,
      // Only the complete report counts as collected: the Completion Notice still names every
      // task, and the report with the Post-Review Policy stays due. Usage receipts are separate.
      tasks: [],
      taskStates: reviewTaskStates(handle),
    },
  };
}
