import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import type { ReviewRunBatch } from "../../background/batch.ts";

/**
 * Review's `agent_cancel` result for a Background Review. The runtime owns the tool and requests
 * the stop afterwards; Review supplies only this result.
 */
export function cancelReviewBatch(
  batch: ReviewRunBatch,
  requested: boolean,
  needsCollection: boolean,
): AgentToolResult<unknown> {
  const status = requested
    ? "Stop requested. Cleanup may still be active."
    : "No active work remains.";
  const collection = needsCollection
    ? " Collect the report, including canceled tasks and Usage, with agent_result."
    : "";
  return {
    content: [
      {
        type: "text",
        text: `Background Review ${batch.handle.batchId}: ${status}${collection}`,
      },
    ],
    details: { batchId: batch.handle.batchId, requested, needsCollection },
  };
}
