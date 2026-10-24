import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Value } from "typebox/value";
import type { DelegationController } from "../../delegation/controller.ts";
import { toolDescription } from "./guidance.ts";
import { renderCall, renderResult } from "./render.ts";
import { buildCancelResult } from "./result.ts";
import { agentCancelSpec } from "./spec.ts";

/** Register explicit model-controlled cancellation of a background batch. */
export function registerAgentCancelTool(pi: ExtensionAPI, controller: DelegationController): void {
  pi.registerTool({
    ...agentCancelSpec,
    description: toolDescription,
    renderCall,
    renderResult,
    // biome-ignore lint/complexity/useMaxParams: Pi execute requires five parameters.
    async execute(_callId, params, _signal, _onUpdate, ctx) {
      if (!Value.Check(agentCancelSpec.parameters, params))
        throw new Error("Invalid agent_cancel input.");
      const batch = controller.get(params.batchId, ctx);
      const requested = controller.registry
        .snapshot()
        .runs.some((run) => run.batchId === batch.handle.batchId && run.active);
      const needsCollection =
        batch.handle.snapshot().results.length < batch.handle.progress().totalCount ||
        !controller.isCollected(batch, ctx);
      if (requested) void batch.handle.stop().catch(() => undefined);
      return buildCancelResult(params.batchId, requested, needsCollection);
    },
  });
}
