import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import { recordDebugEvent } from "@mrclrchtr/supi-core/debug";
import { sanitizeAgentRunErrorText } from "./diagnostic-sanitizer.ts";
import type { AgentRunDisplayMetadata } from "./session/agent-run-registry-types.ts";
import type { AgentRunSessionView } from "./types.ts";

/** Debug category of the event recorded when a registered Agent Run compacts its context. */
export const AGENT_RUN_COMPACTION_DEBUG_CATEGORY = "agent-run-compaction";

/**
 * Record one Debug event for each finished compaction of a registered Agent Run, so a run that
 * outgrew its context window can be found and analyzed. Records correlation metadata and token
 * counts only; never the summary, task text, or conversation.
 */
export function observeAgentRunCompaction(
  session: AgentRunSessionView,
  metadata: AgentRunDisplayMetadata & { readonly runKey: string; readonly batchId: string },
): () => void {
  return session.subscribe((event: AgentSessionEvent) => {
    if (event.type !== "compaction_end") return;
    const succeeded = event.result !== undefined && !event.aborted;
    const errorText = sanitizeAgentRunErrorText(event.errorMessage);
    recordDebugEvent({
      source: "supi-agent-runtime",
      cwd: metadata.cwd,
      category: AGENT_RUN_COMPACTION_DEBUG_CATEGORY,
      level: succeeded ? "info" : "warning",
      message: `Agent Run compaction (${event.reason})`,
      data: {
        runKey: metadata.runKey,
        batchId: metadata.batchId,
        taskId: metadata.taskId,
        kind: metadata.kind,
        label: metadata.label,
        modelId: metadata.modelId,
        reason: event.reason,
        aborted: event.aborted,
        willRetry: event.willRetry,
        // "tokens" keys are redacted by the shared Debug sanitizer.
        ...(event.result
          ? {
              contextBefore: event.result.tokensBefore,
              ...(event.result.estimatedTokensAfter === undefined
                ? {}
                : { contextAfterEstimate: event.result.estimatedTokensAfter }),
            }
          : {}),
        ...(errorText === undefined ? {} : { errorText }),
      },
    });
  });
}
