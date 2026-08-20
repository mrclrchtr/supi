import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { makeAgentRunExecute } from "./execute.ts";
import { toolDescription } from "./guidance.ts";
import { AgentRunRegistry } from "./registry.ts";
import { renderCall, renderResult } from "./render.ts";
import { agentRunSpec, buildAgentRunParameters } from "./spec.ts";

export const registry = new AgentRunRegistry();

/** Register the foreground agent_run tool on a PI extension. */
export function registerAgentRunTool(pi: ExtensionAPI): void {
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
