import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AgentRunRegistry } from "@mrclrchtr/supi-agent-runtime/api";
import type { TSchema } from "typebox";
import { Value } from "typebox/value";
import { agentProfileCatalogueStore } from "../../session.ts";
import { runDelegationBatch } from "./batch-runner.ts";
import type { BatchProgressState } from "./batch-types.ts";
import { buildAgentRunResult } from "./result.ts";
import type { AgentRunToolParams } from "./schema.ts";

type AgentRunExecute = NonNullable<Parameters<ExtensionAPI["registerTool"]>[0]["execute"]>;

/** Build the agent_run execute function for one registry and schema instance. */
export function makeAgentRunExecute(
  registry: AgentRunRegistry,
  parameters: TSchema,
): AgentRunExecute {
  // biome-ignore lint/complexity/useMaxParams: Pi execute contract requires 5 parameters.
  return async (_toolCallId, params, _signal, onUpdate, ctx) => {
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

    const outcome = await runDelegationBatch(toolParams, catalogue, ctx, onBatchUpdate, registry);

    // Finalize the batch after its transcript files have closed.
    return buildAgentRunResult(outcome, toolParams.sharedContext);
  };
}
