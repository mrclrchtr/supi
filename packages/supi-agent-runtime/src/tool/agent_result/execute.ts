import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { TSchema } from "typebox";
import { Value } from "typebox/value";
import type { CollectableRunBatch } from "../../background/types.ts";
import { RUN_BATCH_OWNER_KEY, requireRunBatches } from "../batches.ts";

type Execute = NonNullable<Parameters<ExtensionAPI["registerTool"]>[0]["execute"]>;
type OnUpdate = NonNullable<Parameters<Execute>[3]>;

const PROGRESS_POLL_MS = 1_000;

/** Push owner progress while waiting; handles have no subscription, so poll and dedupe. */
function streamProgress({ batch, collection }: CollectableRunBatch, onUpdate: OnUpdate) {
  const progress = collection.progress;
  if (!progress) return undefined;
  let last = "";
  const push = () => {
    const update = progress(batch);
    const key = JSON.stringify(update.details);
    if (key === last) return;
    last = key;
    onUpdate(update);
  };
  push();
  const timer = setInterval(push, PROGRESS_POLL_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}

/**
 * Own Result Collection ordering for every owner: resolve, wait, revalidate, let the owner
 * assemble output, then reserve the Usage of that output.
 */
export function makeAgentResultExecute(pi: ExtensionAPI, parameters: TSchema): Execute {
  // biome-ignore lint/complexity/useMaxParams: Pi execute requires five parameters.
  return async (callId, input, signal, onUpdate, ctx) => {
    if (!Value.Check(parameters, input)) throw new Error("Invalid agent_result input.");
    const params = input as { batchId: string; wait?: boolean };
    const batches = requireRunBatches(pi);
    const resolved = batches.resolveCollection(params.batchId, ctx);
    const { batch, collection } = resolved;
    const caller = signal ?? ctx.signal;
    if (params.wait) {
      const stopProgress = onUpdate ? streamProgress(resolved, onUpdate) : undefined;
      try {
        await batches.wait(
          batch,
          caller,
          collection.canceledMessages?.wait ?? "Run Batch wait canceled.",
        );
      } finally {
        stopProgress?.();
      }
    }
    if (caller?.aborted)
      throw new Error(collection.canceledMessages?.collection ?? "Run Batch collection canceled.");
    requireRunBatches(pi).resolveCollection(params.batchId, ctx);
    const result = collection.collect(callId, batch, ctx);
    const receipt = batches.prepareUsage(callId, batch);
    return {
      ...result,
      usage: receipt.usage,
      details: {
        ...result.details,
        usageReceipt: receipt.usageReceipt,
        [RUN_BATCH_OWNER_KEY]: resolved.ownerKey,
      },
    };
  };
}
