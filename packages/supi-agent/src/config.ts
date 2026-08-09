import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { loadSupiConfig } from "@mrclrchtr/supi-core/config";
import { registerDeclarativeSettings } from "@mrclrchtr/supi-core/settings";

/** Persisted Agent Run settings. */
export interface AgentConfig extends Record<string, unknown> {
  /** Enable the supi_agent_run agent tool. */
  agentToolEnabled: boolean;
}

/** Shared SuPi configuration section owned by this package. */
export const AGENT_CONFIG_SECTION = "agent";
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

/** Contribute the Agent Run availability setting to `/supi-settings`. */
export function registerAgentSettings(pi: ExtensionAPI, homeDir?: string): void {
  registerDeclarativeSettings(pi, {
    id: AGENT_CONFIG_SECTION,
    label: "Agent",
    section: AGENT_CONFIG_SECTION,
    defaults: AGENT_DEFAULTS,
    fields: [
      {
        kind: "boolean",
        key: "agentToolEnabled",
        label: "Agent Run tool",
        description: "Enable supi_agent_run for agents. Requires /reload.",
      },
    ],
    ...(homeDir ? { homeDir } : {}),
  });
}
