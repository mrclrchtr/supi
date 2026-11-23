import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { makeAgentCancelExecute } from "./agent_cancel/execute.ts";
import { toolDescription as cancelDescription } from "./agent_cancel/guidance.ts";
import { renderCall as renderCancelCall } from "./agent_cancel/render.ts";
import { agentCancelSpec } from "./agent_cancel/spec.ts";
import { makeAgentResultExecute } from "./agent_result/execute.ts";
import { toolDescription as resultDescription } from "./agent_result/guidance.ts";
import { renderCall as renderResultCall } from "./agent_result/render.ts";
import { agentResultSpec } from "./agent_result/spec.ts";
import { renderOwnedResult } from "./render.ts";

/**
 * Register `agent_result` and `agent_cancel` on one owner's extension API. Both serve every
 * owner of the Pi runtime: they find the session's batches at call time.
 */
export function registerCollectionTools(pi: ExtensionAPI): void {
  pi.registerTool({
    ...agentResultSpec,
    description: resultDescription,
    renderCall: renderResultCall,
    renderResult: renderOwnedResult(pi, "renderResult"),
    execute: makeAgentResultExecute(pi, agentResultSpec.parameters),
  });
  pi.registerTool({
    ...agentCancelSpec,
    description: cancelDescription,
    renderCall: renderCancelCall,
    renderResult: renderOwnedResult(pi, "renderCancel"),
    execute: makeAgentCancelExecute(pi),
  });
}
