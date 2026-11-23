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
