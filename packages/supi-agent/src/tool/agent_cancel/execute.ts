import type { AgentToolResult, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { DelegationController, ManagedBatch } from "../../delegation/controller.ts";
import { buildCancelResult } from "./result.ts";

/** Format a Delegation Batch cancellation; the runtime requests the stop afterwards. */
export function cancelDelegationBatch(
  controller: DelegationController,
  batch: ManagedBatch,
  requested: boolean,
  ctx: ExtensionContext,
): AgentToolResult<unknown> {
  const needsCollection =
    batch.handle.snapshot().results.length < batch.handle.progress().totalCount ||
    !controller.isCollected(batch, ctx);
  return buildCancelResult(batch.handle.batchId, requested, needsCollection);
}
