import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { TSchema } from "typebox";
import { agentProfileCatalogueStore } from "../session.ts";
import { runDelegationBatch } from "./batch-runner.ts";
import { AgentRunRegistry } from "./registry.ts";
import { renderCall, renderResult } from "./render.ts";
import { type AgentRunToolParams, buildAgentRunSchema } from "./schema.ts";

const registry = new AgentRunRegistry();

function buildSchema(catalogue: ReturnType<typeof agentProfileCatalogueStore.get>): TSchema {
  if (!catalogue || catalogue.profiles.length === 0) {
    return buildAgentRunSchema(
      catalogue ?? {
        profiles: [],
        diagnostics: [],
        profileIds: [],
        omittedProfileCount: 0,
        sourceDirectories: { package: "", global: "" },
      },
    );
  }
  return buildAgentRunSchema(catalogue);
}

/** Register the foreground supi_agent_run tool on a PI extension. */
export function registerAgentRunTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "supi_agent_run",
    label: "Agent Run",
    description:
      "Delegate one or more tasks to Agent Profiles in foreground. Read-only profiles may run concurrently (1-4 tasks); mutation-capable profiles require a single-task batch. Returns ordered results with attribution. All runs are foreground-awaited; no background or recursive delegation.",
    executionMode: "sequential",
    parameters: buildSchema(agentProfileCatalogueStore.get()),
    renderCall,
    renderResult,
    // biome-ignore lint/complexity/useMaxParams: Pi execute contract requires 5 parameters.
    async execute(_toolCallId, params, _signal, onUpdate, ctx) {
      const catalogue = agentProfileCatalogueStore.get();
      if (!catalogue) {
        throw new Error("Agent Profile catalogue is not yet loaded. Wait for session start.");
      }
      if (catalogue.profiles.length === 0) {
        throw new Error("No valid Agent Profiles are available.");
      }

      const toolParams = params as AgentRunToolParams;

      const onBatchUpdate = onUpdate
        ? (state: {
            tasks: readonly {
              taskId: string;
              profileId: string;
              status: string;
              turns: number;
              toolUses: number;
              usage?: { totalTokens?: number };
            }[];
            completedCount: number;
            totalCount: number;
          }) => {
            onUpdate({
              content: [{ type: "text" as const, text: "Working…" }],
              details: state,
            });
          }
        : undefined;

      const { modelText, results, aggregateUsage } = await runDelegationBatch(
        toolParams,
        catalogue,
        ctx,
        onBatchUpdate,
        registry,
      );

      // Settle active runs + finalize batch in the registry.
      for (const result of results) {
        registry.settle(result.taskId);
      }
      const batch = registry.completeBatch(results, toolParams.sharedContext, aggregateUsage);

      return {
        content: [{ type: "text" as const, text: modelText }],
        details: {
          tasks: results,
          sharedContext: toolParams.sharedContext,
          aggregateUsage,
          conversationViews: batch.conversationViews,
        },
        usage: aggregateUsage,
      };
    },
  });
}

export { registry };
