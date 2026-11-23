import type { AgentToolResult, SessionEntry } from "@earendil-works/pi-coding-agent";
import {
  type CompletionNotice,
  type RunBatch,
  readResultCollection,
} from "@mrclrchtr/supi-agent-runtime/api";
import type { PostReviewPolicy } from "../config.ts";
import type { ReviewArtifactStore } from "../session/review-artifact-store.ts";
import { createReviewOutput } from "../tool/output-page.ts";
import { formatReviewBatch, formatWorkspaceReceipt } from "../tool/review_run/format.ts";
import { buildRunResult } from "../tool/review_run/result.ts";
import type { PreparedReview } from "../tool/review_run/workflow.ts";
import type { ReviewTaskResult } from "../types.ts";
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

/** Note on every collected report: findings describe the frozen state, not the live checkout. */
export const REVIEWED_STATE_NOTE =
  "Reviewed state: the frozen Review Workspace in the receipt above. The live checkout may differ since the Review started; check each finding against it before acting.";

/** Start result of a Background Review: handle, tasks, and receipt, without findings or Usage. */
export function buildBackgroundStartResult(
  handle: ReviewBatchHandle,
  prepared: PreparedReview,
): AgentToolResult<Record<string, unknown>> {
  const tasks = handle.tasks.map((task) => ({ ...task, status: "running" as const }));
  const text = [
    `Background Review started: batch ${handle.batchId}.`,
    `Target: ${prepared.snapshot.title}`,
    formatWorkspaceReceipt(prepared.workspace.receipt),
    `Tasks: ${tasks.map((task) => `${task.taskId} (${task.mode}, running)`).join(", ")}`,
    `One Completion Notice follows when every Review Task is terminal. Then collect the report with agent_result ${JSON.stringify({ batchId: handle.batchId })}; do not poll.`,
  ].join("\n");
  return {
    content: [{ type: "text", text }],
    details: {
      mode: "background",
      batchId: handle.batchId,
      targetTitle: prepared.snapshot.title,
      tasks,
      workspaceReceipt: prepared.workspace.receipt,
    },
  };
}

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

/** Format a Background Review stop request; the runtime requests the stop afterwards. */
export function cancelReviewBatch(
  batch: ReviewRunBatch,
  requested: boolean,
  needsCollection: boolean,
): AgentToolResult<unknown> {
  const status = requested
    ? "Stop requested. Cleanup may still be active."
    : "No active work remains.";
  const collection = needsCollection
    ? " Collect the report, including canceled tasks and Usage, with agent_result."
    : "";
  return {
    content: [
      {
        type: "text",
        text: `Background Review ${batch.handle.batchId}: ${status}${collection}`,
      },
    ],
    details: { batchId: batch.handle.batchId, requested, needsCollection },
  };
}
