import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { TSchema } from "typebox";
import { Value } from "typebox/value";
import { requireRunBatches } from "../batches.ts";
import { stampOwnedResult } from "../result.ts";

type Execute = NonNullable<Parameters<ExtensionAPI["registerTool"]>[0]["execute"]>;

/** Resolve the batch for every owner, let its owner format the result, then request the stop. */
export function makeAgentCancelExecute(pi: ExtensionAPI, parameters: TSchema): Execute {
  // biome-ignore lint/complexity/useMaxParams: Pi execute requires five parameters.
  return async (_callId, input, _signal, _onUpdate, ctx) => {
    if (!Value.Check(parameters, input)) throw new Error("Invalid agent_cancel input.");
    const params = input as { batchId: string };
    const batches = requireRunBatches(pi);
    const { batch, collection, ownerKey } = batches.resolveCollection(params.batchId, ctx);
    const requested = batches.hasActiveRuns(batch);
    const result = collection.cancel(batch, { requested }, ctx);
    // A controller created by an older bundled runtime copy may lack `requestStop`.
    if (requested && typeof batches.requestStop === "function") batches.requestStop(batch);
    else if (requested) void batch.handle.stop().catch(() => undefined);
    return stampOwnedResult(result, ownerKey);
  };
}
