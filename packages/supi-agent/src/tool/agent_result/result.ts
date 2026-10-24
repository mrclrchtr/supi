import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import type { BatchTaskResult, DelegationBatchHandle } from "../agent_run/batch-types.ts";
import { buildAgentRunResult } from "../agent_run/result.ts";
import { AGENT_COMPLETION_MESSAGE_TYPE } from "../names.ts";

/** Build a bounded snapshot. The collected flag applies to available results, not pending tasks. */
export function buildCollectedResult(
  handle: DelegationBatchHandle,
  results?: readonly BatchTaskResult[],
  alreadyCollected = false,
): AgentToolResult<Record<string, unknown>> {
  const snapshot = handle.snapshot();
  const outcome = results ? { ...snapshot, results: [...results] } : snapshot;
  const pending = handle
    .progress()
    .tasks.filter((task) => !outcome.results.some((ready) => ready.taskId === task.taskId));
  const status = pending.length
    ? `Pending: ${pending.map((task) => `${task.taskId} (${task.status})`).join(", ")}. Wait for a completion notice or use wait: true; do not poll.`
    : "All task results are ready.";
  const introduction = alreadyCollected ? `Already collected; no new Usage.\n${status}` : status;
  const result = buildAgentRunResult(outcome, undefined, introduction);
  return {
    ...result,
    details: {
      ...result.details,
      batchId: handle.batchId,
      complete: pending.length === 0,
      alreadyCollected,
      pending,
    },
  };
}

/** Build a small completion notice without task output or Usage. */
export function buildCompletionNotice(batchId: string, tasks: readonly BatchTaskResult[]) {
  return {
    customType: AGENT_COMPLETION_MESSAGE_TYPE,
    content: `Background batch ${batchId}: ${tasks.map((task) => `${JSON.stringify(task.taskId)} ${task.status}`).join(", ")}. Collect available results and Usage with agent_result.`,
    display: true,
    details: { batchId, taskIds: tasks.map((task) => task.taskId) },
  };
}
