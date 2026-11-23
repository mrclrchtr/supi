import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import type { CompletionNoticeTarget } from "./types.ts";
import { RESULT_COLLECTION_TOOL_NAME } from "./usage-receipts.ts";

/**
 * Read the batch and task IDs delivered by a successful stored Result Collection, independently of
 * whether its Usage was reported. The collection result's `details` must carry `batchId` and
 * `tasks[].taskId`.
 */
export function readResultCollection(entry: SessionEntry): CompletionNoticeTarget | undefined {
  if (
    entry.type !== "message" ||
    entry.message.role !== "toolResult" ||
    entry.message.toolName !== RESULT_COLLECTION_TOOL_NAME ||
    entry.message.isError
  ) {
    return undefined;
  }
  const details = entry.message.details as
    | { batchId?: unknown; tasks?: ({ taskId?: unknown } | null)[] }
    | undefined;
  if (typeof details?.batchId !== "string" || !Array.isArray(details.tasks)) return undefined;
  return {
    batchId: details.batchId,
    taskIds: details.tasks.flatMap((task) =>
      typeof task?.taskId === "string" ? [task.taskId] : [],
    ),
  };
}

/** Task IDs of one batch whose Result Collection Pi stored on the given branch. */
export function collectedTaskIds(branch: readonly SessionEntry[], batchId: string): Set<string> {
  const collected = new Set<string>();
  for (const entry of branch) {
    const result = readResultCollection(entry);
    if (result?.batchId === batchId) for (const taskId of result.taskIds) collected.add(taskId);
  }
  return collected;
}
