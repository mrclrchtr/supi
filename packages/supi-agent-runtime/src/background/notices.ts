import type { ExtensionAPI, SessionEntry } from "@earendil-works/pi-coding-agent";
import { recordDebugEvent } from "@mrclrchtr/supi-core/debug";
import type { RunBatchHandle, RunBatchOwnerOptions, RunBatchTask } from "./types.ts";

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
  } catch {
    recordDebugEvent({
      source: options.source,
      level: "warning",
      category: "background-run-batch",
      message: "Background completion delivery failed. Results remain available for collection.",
    });
  }
}

/** Read the batch and task IDs of stored notice details; malformed details count as stale. */
export function readNoticeTarget(
  details: unknown,
): { batchId: string; taskIds: readonly string[] } | undefined {
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
