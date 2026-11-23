import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import type { CompletionNotice, CompletionNoticeTarget } from "@mrclrchtr/supi-agent-runtime/api";
import type {
  BatchTaskResult,
  BatchTaskStatus,
  DelegationBatchHandle,
} from "../agent_run/batch-types.ts";
import { buildAgentRunResult } from "../agent_run/result.ts";

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

/**
 * TUI-only task summary carried by a completion notice. Custom message `details` never reach
 * the model, so the human-capped final text can be shown here without leaking output or Usage.
 */
export interface CompletionNoticeTask {
  taskId: string;
  profileId: string;
  status: BatchTaskStatus;
  failureCode?: string;
  failureSummary?: string;
  /** Human-capped final assistant text of the child, shown when the notice is expanded. */
  finalText?: string;
}

/** Completion notice details: `taskIds` drives context filtering, `tasks` drives rendering. */
export interface CompletionNoticeDetails extends CompletionNoticeTarget {
  readonly tasks: CompletionNoticeTask[];
}

/** Build a completion notice whose model-facing content excludes task output and Usage. */
export function buildCompletionNotice(
  batchId: string,
  tasks: readonly BatchTaskResult[],
): CompletionNotice {
  const details: CompletionNoticeDetails = {
    batchId,
    taskIds: tasks.map((task) => task.taskId),
    tasks: tasks.map(
      ({ taskId, profileId, status, failureCode, failureSummary, finalTextFull }) => ({
        taskId,
        profileId,
        status,
        ...(failureCode ? { failureCode } : {}),
        ...(failureSummary ? { failureSummary } : {}),
        ...(finalTextFull?.trim() ? { finalText: finalTextFull } : {}),
      }),
    ),
  };
  return {
    content: `Background batch ${batchId}: ${tasks.map((task) => `${JSON.stringify(task.taskId)} ${task.status}`).join(", ")}. Collect available results and Usage with agent_result.`,
    display: true,
    details,
  };
}
