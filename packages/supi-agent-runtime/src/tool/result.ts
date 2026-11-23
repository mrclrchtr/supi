import type { Usage } from "@earendil-works/pi-ai";
import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import type { RunBatchUsageReceipt } from "../background/types.ts";

/** Details key that names the owner of a collection result, so stored results render by owner. */
export const RUN_BATCH_OWNER_KEY = "runBatchOwner";

/**
 * Stamp the runtime's reserved fields onto an owner-built collection tool result:
 * `details.runBatchOwner` always, and `usage` with `details.usageReceipt` when a Result
 * Collection reserved Usage. Every other owner `details` key is kept.
 */
export function stampOwnedResult(
  result: AgentToolResult<unknown>,
  ownerKey: string,
  reserved?: { readonly usage?: Usage; readonly usageReceipt?: RunBatchUsageReceipt },
): AgentToolResult<Record<string, unknown>> {
  return {
    ...result,
    ...(reserved ? { usage: reserved.usage } : {}),
    details: {
      ...(result.details as Record<string, unknown> | undefined),
      ...(reserved ? { usageReceipt: reserved.usageReceipt } : {}),
      [RUN_BATCH_OWNER_KEY]: ownerKey,
    },
  };
}
