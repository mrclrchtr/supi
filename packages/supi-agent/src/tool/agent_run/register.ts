import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AgentRunRegistry } from "@mrclrchtr/supi-agent-runtime/api";
import { makeAgentRunExecute } from "./execute.ts";
import { toolDescription } from "./guidance.ts";
import { renderCall, renderResult } from "./render.ts";
import { agentRunSpec, buildAgentRunParameters } from "./spec.ts";

/** Register the foreground agent_run tool on a PI extension. */
export function registerAgentRunTool(pi: ExtensionAPI, registry: AgentRunRegistry): void {
  const parameters = buildAgentRunParameters();
  pi.registerTool({
    ...agentRunSpec,
    description: toolDescription,
    parameters,
    renderCall,
    renderResult,
    execute: makeAgentRunExecute(registry, parameters),
  });
}
