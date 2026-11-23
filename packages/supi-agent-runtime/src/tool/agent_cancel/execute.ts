import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Value } from "typebox/value";
import { findRuntimeState } from "../../session/runtime-state.ts";
import { RUN_BATCH_OWNER_KEY, requireRunBatches } from "../batches.ts";
import { agentCancelSpec } from "./spec.ts";

type Execute = NonNullable<Parameters<ExtensionAPI["registerTool"]>[0]["execute"]>;

/** Resolve the batch for every owner, let its owner format the result, then request the stop. */
export function makeAgentCancelExecute(pi: ExtensionAPI): Execute {
  // biome-ignore lint/complexity/useMaxParams: Pi execute requires five parameters.
  return async (_callId, params, _signal, _onUpdate, ctx) => {
    if (!Value.Check(agentCancelSpec.parameters, params))
      throw new Error("Invalid agent_cancel input.");
    const resolved = requireRunBatches(pi).resolveCollection(params.batchId, ctx);
    const { batch, collection } = resolved;
    const requested = !!findRuntimeState(pi)
      ?.registry.snapshot()
      .runs.some((run) => run.batchId === batch.handle.batchId && run.active);
    const result = collection.cancel(batch, { requested }, ctx);
    if (requested) void batch.handle.stop().catch(() => undefined);
    return {
      ...result,
      details: {
        ...(result.details as Record<string, unknown> | undefined),
        [RUN_BATCH_OWNER_KEY]: resolved.ownerKey,
      },
    };
  };
}
