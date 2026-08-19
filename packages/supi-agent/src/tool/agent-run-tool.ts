import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { TSchema } from "typebox";
import { Value } from "typebox/value";
import { agentProfileCatalogueStore } from "../session.ts";
import { runDelegationBatch } from "./batch-runner.ts";
import { AgentRunRegistry, type BatchProgressState } from "./registry.ts";
import { renderCall, renderResult } from "./render.ts";
import { type AgentRunToolParams, buildAgentRunSchema } from "./schema.ts";

const registry = new AgentRunRegistry();

function buildSchema(catalogue: ReturnType<typeof agentProfileCatalogueStore.get>): TSchema {
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

/** Register the foreground agent_run tool on a PI extension. */
export function registerAgentRunTool(pi: ExtensionAPI): void {
  const parameters = buildSchema(agentProfileCatalogueStore.get());
  pi.registerTool({
    name: "agent_run",
    label: "Agent Run",
    description:
      "Delegate tasks to Agent Profiles in foreground. Read-only profiles can run concurrently; mutation-capable profiles require one task. Results keep task attribution and are limited to 2,000 lines or 50KB. Runs cannot execute in the background or delegate recursively.",
    executionMode: "sequential",
    parameters,
    renderCall,
    renderResult,
    // biome-ignore lint/complexity/useMaxParams: Pi execute contract requires 5 parameters.
    async execute(_toolCallId, params, _signal, onUpdate, ctx) {
      const catalogue = agentProfileCatalogueStore.get();
      if (!catalogue) {
        throw new Error("Agent Profile catalogue is not yet loaded. Wait for session start.");
      }
      if (catalogue.profileIds.length === 0) {
        throw new Error("No valid Agent Profiles are available.");
      }
      if (!Value.Check(parameters, params)) {
        throw new Error("Invalid agent_run input.");
      }

      const toolParams = params as AgentRunToolParams;

      const onBatchUpdate = onUpdate
        ? (state: BatchProgressState) => {
            onUpdate({
              content: [{ type: "text" as const, text: "Working…" }],
              details: state,
            });
          }
        : undefined;

      const { modelText, fullOutputPath, results, aggregateUsage } = await runDelegationBatch(
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
          ...(fullOutputPath ? { fullOutputPath } : {}),
        },
        usage: aggregateUsage,
      };
    },
  });
}

export { registry };
