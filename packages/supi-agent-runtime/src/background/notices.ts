import type { ExtensionAPI, SessionEntry } from "@earendil-works/pi-coding-agent";
import { recordDebugEvent } from "@mrclrchtr/supi-core/debug";
import { readResultCollection } from "./collection.ts";
import type {
  CompletionNoticeTarget,
  RunBatchHandle,
  RunBatchOwnerOptions,
  RunBatchTask,
} from "./types.ts";

/** Send one owner-built Completion Notice; a failed send leaves results collectable. */
export function sendCompletionNotice(
  pi: ExtensionAPI,
  options: RunBatchOwnerOptions<RunBatchHandle, unknown>,
  batchId: string,
  tasks: readonly RunBatchTask[],
): void {
  try {
    const notice = options.buildNotice(batchId, tasks);
    pi.sendMessage(
      {
        customType: options.noticeType,
        content: notice.content,
        display: notice.display ?? true,
        details: notice.details,
      },
      { deliverAs: "steer", triggerTurn: true },
    );
    const taskIds = tasks.map((task) => task.taskId);
    recordNoticeDecision(options.source, batchId, taskIds, "sent");
  } catch {
    recordDebugEvent({
      source: options.source,
      level: "warning",
      category: "background-run-batch",
      message: "Background completion delivery failed. Results remain available for collection.",
    });
  }
}

/**
 * Record a Completion Notice decision for the `debug` tool. A task is decided once: its notice is
 * sent, or skipped because Pi stored its Result Collection first.
 */
function recordNoticeDecision(
  source: string,
  batchId: string,
  taskIds: readonly string[],
  decision: "sent" | "skipped",
): void {
  recordDebugEvent({
    source,
    level: "debug",
    category: "background-run-batch",
    message: `Completion Notice ${decision}`,
    data: { batchId, taskIds, decision, ...(decision === "skipped" && { reason: "collected" }) },
  });
}

/**
 * Mark tasks of every stored Result Collection on the branch as decided. A result collected before
 * its notice was due needs no notice and no parent turn.
 */
export function skipCollectedNotices(
  branch: readonly SessionEntry[],
  lookup: (batchId: string) => { notified: Set<string>; source: string } | undefined,
): void {
  for (const entry of branch) {
    const collection = readResultCollection(entry);
    const batch = collection && lookup(collection.batchId);
    if (!collection || !batch) continue;
    const skipped = collection.taskIds.filter((taskId) => !batch.notified.has(taskId));
    for (const taskId of skipped) batch.notified.add(taskId);
    if (skipped.length) recordNoticeDecision(batch.source, collection.batchId, skipped, "skipped");
  }
}

/** Read the batch and task IDs of stored notice details; malformed details count as stale. */
export function readNoticeTarget(details: unknown): CompletionNoticeTarget | undefined {
  if (!details || typeof details !== "object") return undefined;
  const { batchId, taskIds } = details as { batchId?: unknown; taskIds?: unknown };
  if (typeof batchId !== "string" || !Array.isArray(taskIds)) return undefined;
  return { batchId, taskIds: taskIds.filter((id): id is string => typeof id === "string") };
}

/** Find the assistant entry on the branch that issued a tool call; it defines launch ownership. */
export function findLaunchEntry(
  callId: string,
  branch: readonly SessionEntry[],
): string | undefined {
  return branch.find(
    (entry) =>
      entry.type === "message" &&
      entry.message.role === "assistant" &&
      entry.message.content.some((part) => part.type === "toolCall" && part.id === callId),
  )?.id;
}
