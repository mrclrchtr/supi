import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { requestChildWebTools } from "@mrclrchtr/supi-core/session";
import type { DelegationController } from "../../delegation/controller.ts";
import { makeAgentRunExecute } from "./execute.ts";
import { toolDescription } from "./guidance.ts";
import { prepareAgentRunArguments } from "./input.ts";
import { renderCall, renderResult } from "./render.ts";
import { agentRunSpec, buildAgentRunParameters } from "./spec.ts";

/** Register profile-based delegation on a Pi extension. */
export function registerAgentRunTool(pi: ExtensionAPI, controller: DelegationController): void {
  const parameters = buildAgentRunParameters();
  pi.registerTool({
    ...agentRunSpec,
    description: toolDescription,
    parameters,
    prepareArguments: prepareAgentRunArguments,
    renderCall,
    renderResult,
    execute: makeAgentRunExecute(controller, parameters, (cwd) =>
      requestChildWebTools(pi.events, { configCwd: cwd }),
    ),
  });
}
