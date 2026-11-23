import { randomUUID } from "node:crypto";
import type { Usage } from "@earendil-works/pi-ai";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { AGENT_RESULT_TOOL_NAME } from "../tool/names.ts";
import { combineAgentRunUsage } from "../usage.ts";
import type { RunBatchTask, RunBatchUsageReceipt } from "./types.ts";

/** Name of the Result Collection tool whose stored results report Usage. */
export const RESULT_COLLECTION_TOOL_NAME = AGENT_RESULT_TOOL_NAME;

interface PendingReceipt {
  readonly receipt: RunBatchUsageReceipt;
  readonly callId: string;
  readonly usage: Usage;
}

/** Reserve Usage once, but commit it only from a stored Pi tool result. */
export class RunBatchUsageReceipts {
  readonly #pending = new Map<string, PendingReceipt>();
  readonly #reported = new Set<string>();

  /** Prepare a receipt after output assembly succeeds. Concurrent reads cannot reserve it twice. */
  prepare(
    callId: string,
    batchId: string,
    tasks: readonly RunBatchTask[],
  ): { usage?: Usage; usageReceipt?: RunBatchUsageReceipt } {
    const reserved = new Set(
      [...this.#pending.values()].flatMap(({ receipt }) =>
        receipt.taskIds.map((id) => key(receipt.batchId, id)),
      ),
    );
    const unreported = tasks.filter(
      (task) =>
        task.usage &&
        !this.reported(batchId, task.taskId) &&
        !reserved.has(key(batchId, task.taskId)),
    );
    const usage = combineAgentRunUsage(unreported.map((task) => task.usage));
    if (!usage) return {};
    const receipt: RunBatchUsageReceipt = {
      token: randomUUID(),
      batchId,
      taskIds: unreported.map((task) => task.taskId),
    };
    this.#pending.set(receipt.token, { receipt, usage, callId });
    return { usage, usageReceipt: receipt };
  }

  /** Reconcile persisted receipts; release unstored claims only after the parent turn settles. */
  reconcile(entries: readonly SessionEntry[], releaseUnstored = false): void {
    for (const [token, pending] of this.#pending) {
      const stored = entries.find(
        (entry) =>
          entry.type === "message" &&
          entry.message.role === "toolResult" &&
          entry.message.toolCallId === pending.callId,
      );
      if (stored?.type === "message" && stored.message.role === "toolResult") {
        const message = stored.message;
        // Pi counts stored Usage even if a result hook changes isError or replaces details.
        // The owned call ID and prepared Usage identify accounting separately from delivery.
        if (
          message.toolName === RESULT_COLLECTION_TOOL_NAME &&
          message.usage &&
          containsUsage(message.usage, pending.usage)
        ) {
          for (const id of pending.receipt.taskIds)
            this.#reported.add(key(pending.receipt.batchId, id));
        }
        this.#pending.delete(token);
      } else if (releaseUnstored) this.#pending.delete(token);
    }
  }

  /** Whether Pi has stored this task's Usage, independent of result delivery status. */
  reported(batchId: string, taskId: string): boolean {
    return this.#reported.has(key(batchId, taskId));
  }
}

function key(batchId: string, taskId: string): string {
  return JSON.stringify([batchId, taskId]);
}

function containsUsage(stored: Usage, prepared: Usage): boolean {
  // Result hooks can add their own Usage without replacing the child's accounting.
  return (
    stored.input >= prepared.input &&
    stored.output >= prepared.output &&
    stored.cacheRead >= prepared.cacheRead &&
    stored.cacheWrite >= prepared.cacheWrite &&
    stored.totalTokens >= prepared.totalTokens &&
    stored.cost.total >= prepared.cost.total &&
    (stored.reasoning ?? 0) >= (prepared.reasoning ?? 0) &&
    (stored.cacheWrite1h ?? 0) >= (prepared.cacheWrite1h ?? 0)
  );
}
