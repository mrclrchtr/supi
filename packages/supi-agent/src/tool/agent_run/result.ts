import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
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

/** Assemble the model-facing agent_run result for one completed batch. */
export function buildAgentRunResult(
  outcome: DelegationBatchOutcome,
  batch: CompletedBatch,
  sharedContext?: string,
): AgentToolResult<AgentRunResultDetails> {
  const { modelText, fullOutputPath, results, aggregateUsage } = outcome;
  return {
    content: [{ type: "text", text: modelText }],
    details: {
      tasks: results,
      sharedContext,
      aggregateUsage,
      conversationViews: batch.conversationViews,
      ...(fullOutputPath ? { fullOutputPath } : {}),
    },
    usage: aggregateUsage,
  };
}
