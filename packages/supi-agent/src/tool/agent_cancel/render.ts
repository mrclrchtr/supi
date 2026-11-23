import type { Theme } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

/**
 * Render a Delegation Batch `agent_cancel` result; the runtime renders errors and the call.
 * Distinguish a stop request from completed cleanup.
 */
export function renderResult(
  result: { details?: unknown },
  options: { expanded: boolean; isPartial: boolean },
  theme: Theme,
): Text {
  const details = result.details as
    | { batchId?: string; requested?: boolean; needsCollection?: boolean }
    | undefined;
  const status = options.isPartial
    ? "Requesting stop…"
    : details?.requested
      ? "Stop requested. Cleanup may still be active."
      : "No active work remains.";
  const lines = [status];
  if (!options.isPartial && details?.needsCollection)
    lines.push("Collect any remaining task results and Usage with agent_result.");
  if (options.expanded && details?.batchId) lines.push(details.batchId);
  return new Text(theme.fg("dim", lines.join("\n")), 0, 0);
}
