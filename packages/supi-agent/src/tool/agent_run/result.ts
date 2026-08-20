import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import { type AggregateSection, boundAggregateOutput } from "./aggregate.ts";
import type { runDelegationBatch } from "./batch-runner.ts";
import type { BatchTaskResult, CompletedBatch } from "./registry.ts";

/** Batch outcome returned by the delegation runner. */
export type DelegationBatchOutcome = Awaited<ReturnType<typeof runDelegationBatch>>;

export interface AgentRunResultDetails {
  tasks: BatchTaskResult[];
  sharedContext?: string;
  aggregateUsage: DelegationBatchOutcome["aggregateUsage"];
  conversationViews: CompletedBatch["conversationViews"];
  fullOutputPath?: string;
}

/** Format the joined model-facing batch report. */
export function formatModelResult(results: readonly BatchTaskResult[]): {
  text: string;
  fullOutputPath?: string;
} {
  const sections: AggregateSection[] = results.map((task) => {
    const header = `## ${task.taskId} (profile: ${task.profileId}) — ${task.status}`;
    if (task.status === "completed") {
      return { overhead: header, body: task.finalText ?? "(no output)" };
    }
    const reason = task.failureCode ? ` (${task.failureCode})` : "";
    return {
      overhead: `${header}${reason}\nTurns: ${task.turns} · Tool uses: ${task.toolUses}`,
      body: "",
    };
  });
  return boundAggregateOutput(sections);
}

/** Assemble the model-facing agent_run result for one completed batch. */
export function buildAgentRunResult(
  outcome: DelegationBatchOutcome,
  batch: CompletedBatch,
  sharedContext?: string,
): AgentToolResult<AgentRunResultDetails> {
  const { results, aggregateUsage } = outcome;
  const formatted = formatModelResult(results);
  return {
    content: [{ type: "text", text: formatted.text }],
    details: {
      tasks: results,
      sharedContext,
      aggregateUsage,
      conversationViews: batch.conversationViews,
      ...(formatted.fullOutputPath ? { fullOutputPath: formatted.fullOutputPath } : {}),
    },
    usage: aggregateUsage,
  };
}
