import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { loadSupiConfig } from "@mrclrchtr/supi-core/config";
import { defineConfigSettings, registerSettings } from "@mrclrchtr/supi-core/settings";

/** Persisted Agent Run settings. */
export interface AgentConfig extends Record<string, unknown> {
  /** Enable the agent_run agent tool. */
  agentToolEnabled: boolean;
}

/** Shared SuPi configuration section owned by this package. */
export const AGENT_CONFIG_SECTION = "agent";
const AGENT_RUN_TOOL_NAME = "agent_run";
/** Defaults that retain Agent Run availability. */
export const AGENT_DEFAULTS: AgentConfig = {
  agentToolEnabled: true,
};

/** Load merged and normalized Agent Run settings. */
export function loadAgentConfig(cwd: string, homeDir?: string): AgentConfig {
  const raw = loadSupiConfig(AGENT_CONFIG_SECTION, cwd, AGENT_DEFAULTS, { homeDir });
  const agentToolEnabled =
    typeof raw.agentToolEnabled === "boolean"
      ? raw.agentToolEnabled
      : AGENT_DEFAULTS.agentToolEnabled;
  return { agentToolEnabled };
}

/** Apply the configured Agent Run tool availability to the current PI session. */
export function syncAgentRunTool(pi: ExtensionAPI, cwd: string, homeDir?: string): void {
  const activeTools = pi.getActiveTools();
  const enabled = loadAgentConfig(cwd, homeDir).agentToolEnabled;
  const nextTools = enabled
    ? [...new Set([...activeTools, AGENT_RUN_TOOL_NAME])]
    : activeTools.filter((name) => name !== AGENT_RUN_TOOL_NAME);
  if (nextTools.length !== activeTools.length) pi.setActiveTools(nextTools);
}

/** Contribute the Agent Run availability setting to `/supi-settings`. */
export function registerAgentSettings(pi: ExtensionAPI, homeDir?: string): void {
  registerSettings(
    pi,
    defineConfigSettings({
      id: AGENT_CONFIG_SECTION,
      label: "Agent",
      section: AGENT_CONFIG_SECTION,
      defaults: AGENT_DEFAULTS,
      fields: [
        {
          kind: "boolean",
          key: "agentToolEnabled",
          label: "Agent Run tool",
          description: "Enable agent_run for agents.",
        },
      ],
      afterPersist: ({ cwd }) => syncAgentRunTool(pi, cwd, homeDir),
      ...(homeDir ? { homeDir } : {}),
    }),
  );
}
