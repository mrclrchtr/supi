import type { AgentToolResult, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { DelegationController, ManagedBatch } from "../../delegation/controller.ts";
import { buildCollectedResult } from "./result.ts";

/** Live batch progress streamed while `agent_result` waits for a Delegation Batch. */
export function delegationProgress(batch: ManagedBatch): AgentToolResult<Record<string, unknown>> {
  return {
    content: [{ type: "text", text: "Waiting for Agent Run results…" }],
    details: { batchId: batch.handle.batchId, ...batch.handle.progress() },
  };
}

/**
 * Assemble one Delegation Batch collection after the runtime waited and revalidated. Checkpoints
 * not yet stored or claimed are prepared for this call; the runtime reserves Usage afterwards.
 */
export function collectDelegationBatch(
  controller: DelegationController,
  callId: string,
  batch: ManagedBatch,
  ctx: ExtensionContext,
): AgentToolResult<Record<string, unknown>> {
  const checkpointTasks = controller.prepareCheckpointTasks(callId, batch, ctx);
  const result = buildCollectedResult(
    batch.handle,
    checkpointTasks,
    controller.isCollected(batch, ctx),
  );
  if (typeof result.details.fullOutputPath === "string")
    controller.batches.retainOutput(result.details.fullOutputPath);
  return result;
}
