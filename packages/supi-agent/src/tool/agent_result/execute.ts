import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { TSchema } from "typebox";
import { Value } from "typebox/value";
import type { DelegationController } from "../../delegation/controller.ts";
import type { DelegationBatchHandle } from "../agent_run/batch-types.ts";
import { buildCollectedResult } from "./result.ts";

type Execute = NonNullable<Parameters<ExtensionAPI["registerTool"]>[0]["execute"]>;
type OnUpdate = NonNullable<Parameters<Execute>[3]>;

const PROGRESS_POLL_MS = 1_000;

/** Push live batch progress while waiting; the handle has no subscription, so poll and dedupe. */
function streamProgress(
  handle: DelegationBatchHandle,
  batchId: string,
  onUpdate: OnUpdate,
): () => void {
  let last = "";
  const push = () => {
    const progress = handle.progress();
    const key = JSON.stringify(progress);
    if (key === last) return;
    last = key;
    onUpdate({
      content: [{ type: "text", text: "Waiting for Agent Run results…" }],
      details: { batchId, ...progress },
    });
  };
  push();
  const timer = setInterval(push, PROGRESS_POLL_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}

/** Own collection ordering: wait, revalidate, assemble output, then reserve its Usage. */
export function makeAgentResultExecute(
  controller: DelegationController,
  parameters: TSchema,
): Execute {
  // biome-ignore lint/complexity/useMaxParams: Pi execute requires five parameters.
  return async (callId, input, signal, onUpdate, ctx) => {
    if (!Value.Check(parameters, input)) throw new Error("Invalid agent_result input.");
    const params = input as { batchId: string; wait?: boolean };
    const batch = controller.get(params.batchId, ctx);
    if (params.wait) {
      const stopProgress = onUpdate
        ? streamProgress(batch.handle, params.batchId, onUpdate)
        : undefined;
      try {
        await controller.wait(batch, signal ?? ctx.signal);
      } finally {
        stopProgress?.();
      }
    }
    if ((signal ?? ctx.signal)?.aborted) throw new Error("Delegation collection canceled.");
    controller.get(params.batchId, ctx);
    const checkpointTasks = controller.prepareCheckpointTasks(callId, batch, ctx);
    const result = buildCollectedResult(
      batch.handle,
      checkpointTasks,
      controller.isCollected(batch, ctx),
    );
    if (typeof result.details.fullOutputPath === "string")
      controller.retainOutput(result.details.fullOutputPath);
    const receipt = controller.receipts.prepare(
      callId,
      params.batchId,
      batch.handle.snapshot().results,
    );
    return {
      ...result,
      usage: receipt.usage,
      details: { ...result.details, usageReceipt: receipt.usageReceipt },
    };
  };
}
