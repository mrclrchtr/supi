import type { AgentToolResult } from "@earendil-works/pi-coding-agent";

/** Report a stop request without claiming that disposal has finished. */
export function buildCancelResult(
  batchId: string,
  requested: boolean,
  needsCollection: boolean,
): AgentToolResult<unknown> {
  const status = requested
    ? "Stop requested. Cleanup may still be active."
    : "No active work remains.";
  const collection = needsCollection
    ? " Collect any remaining task results and Usage with agent_result."
    : "";
  return {
    content: [
      {
        type: "text",
        text: `Batch ${batchId}: ${status}${collection}`,
      },
    ],
    details: { batchId, requested, needsCollection },
  };
}
