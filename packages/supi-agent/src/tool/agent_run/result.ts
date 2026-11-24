import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import { type AggregateSection, boundAggregateOutput } from "./aggregate.ts";
import type { runDelegationBatch } from "./batch-runner.ts";
import type { BatchTaskResult, DelegationBatchHandle } from "./batch-types.ts";
import type { AgentConversationView } from "./conversation-view.ts";

/** Batch outcome returned by the delegation runner. */
export type DelegationBatchOutcome = Awaited<ReturnType<typeof runDelegationBatch>>;

export interface AgentRunResultDetails {
  tasks: BatchTaskResult[];
  sharedContext?: string;
  aggregateUsage: DelegationBatchOutcome["aggregateUsage"];
  conversationViews: Record<string, AgentConversationView>;
  fullOutputPath?: string;
}

/** Format the joined model-facing batch report. */
export function formatModelResult(
  results: readonly BatchTaskResult[],
  introduction?: string,
): {
  text: string;
  fullOutputPath?: string;
} {
  const sections: AggregateSection[] = results.map((task) => {
    const directory = task.workingDirectory ? `\nWorking directory: ${task.workingDirectory}` : "";
    const created = task.createdWorktree;
    const worktree = created
      ? `\nBranch: ${created.branch} (created from ${created.baseCommit}; worktree and branch are kept)${
          created.parentUncommitted
            ? "\nThe parent's uncommitted changes were not copied into this worktree."
            : ""
        }`
      : "";
    const header = `## ${task.taskId} (profile: ${task.profileId}) — ${task.status}\nConversation: ${task.conversationId}${directory}${worktree}`;
    if (task.status === "completed") {
      return { overhead: header, body: task.finalText ?? "(no output)" };
    }
    const reason = task.failureCode ? ` (${task.failureCode})` : "";
    return {
      overhead: `${header}${reason}\nTurns: ${task.turns} · Tool uses: ${task.toolUses}`,
      body: task.failureSummary ?? "",
    };
  });
  if (introduction) sections.unshift({ overhead: introduction, body: "" });
  return boundAggregateOutput(sections);
}

/** Return a background handle without child output or Usage. */
export function buildBackgroundStartResult(
  handle: DelegationBatchHandle,
): AgentToolResult<unknown> {
  return {
    content: [
      {
        type: "text",
        text: `Background batch ${handle.batchId} started.\n${handle
          .progress()
          .tasks.map(
            (task) => `${task.taskId}: ${task.status} · conversation ${task.conversationId}`,
          )
          .join(
            "\n",
          )}\nContinue independent work. Completion notices identify ready tasks. Collect with agent_result before continuing a completed conversation; do not poll. Use wait: true when no independent work remains.`,
      },
    ],
    details: { mode: "background", batchId: handle.batchId, ...handle.progress() },
  };
}

/** Assemble the model-facing agent_run result for one completed batch. */
export function buildAgentRunResult(
  outcome: DelegationBatchOutcome,
  sharedContext?: string,
  introduction?: string,
): AgentToolResult<AgentRunResultDetails> {
  const { results, aggregateUsage } = outcome;
  const formatted = formatModelResult(results, introduction);
  return {
    content: [{ type: "text", text: formatted.text }],
    details: {
      tasks: results,
      sharedContext,
      aggregateUsage,
      conversationViews: Object.fromEntries(outcome.conversationViews),
      ...(formatted.fullOutputPath ? { fullOutputPath: formatted.fullOutputPath } : {}),
    },
    usage: aggregateUsage,
  };
}
