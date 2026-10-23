import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { TSchema } from "typebox";
import { Value } from "typebox/value";
import type { DelegationController } from "../../delegation/controller.ts";
import { agentProfileCatalogueStore } from "../../session.ts";
import type { BatchProgressState } from "./batch-types.ts";
import { prepareAgentRunArguments } from "./input.ts";
import { buildAgentRunResult, buildBackgroundStartResult } from "./result.ts";
import type { AgentRunToolParams } from "./schema.ts";

type AgentRunExecute = NonNullable<Parameters<ExtensionAPI["registerTool"]>[0]["execute"]>;

/** Build the agent_run execute function for one registry and schema instance. */
export function makeAgentRunExecute(
  controller: DelegationController,
  parameters: TSchema,
): AgentRunExecute {
  // biome-ignore lint/complexity/useMaxParams: Pi execute contract requires 5 parameters.
  return async (toolCallId, params, _signal, onUpdate, ctx) => {
    const catalogue = agentProfileCatalogueStore.get();
    if (!catalogue) {
      throw new Error("Agent Profile catalogue is not yet loaded. Wait for session start.");
    }
    if (catalogue.profileIds.length === 0) {
      throw new Error("No valid Agent Profiles are available.");
    }
    prepareAgentRunArguments(params);
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

    const batch = await controller.start({
      params: toolParams,
      catalogue,
      ctx,
      callId: toolCallId,
      onUpdate: onBatchUpdate,
    });
    if (batch.mode === "background") return buildBackgroundStartResult(batch.handle);
    const result = buildAgentRunResult(await batch.handle.result, toolParams.sharedContext);
    controller.retainOutput(result.details.fullOutputPath);
    return result;
  };
}
