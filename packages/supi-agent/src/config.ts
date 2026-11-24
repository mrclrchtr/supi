import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { loadSupiConfig } from "@mrclrchtr/supi-core/config";
import { defineConfigSettings, registerSettings } from "@mrclrchtr/supi-core/settings";
import { agentProfileCatalogueStore } from "./session.ts";
import { AGENT_RUN_TOOL_NAME } from "./tool/names.ts";

/** Persisted Agent Run settings. */
export interface AgentConfig extends Record<string, unknown> {
  /** Enable the agent_run agent tool. */
  agentToolEnabled: boolean;
  /** Maximum active foreground and background Agent Runs in one session. */
  maxConcurrentRuns: number;
  /**
   * Dependency Bootstrap shell command run once in each worktree `agent_run` creates
   * (`new.worktree`) before its run starts. Empty runs none.
   */
  bootstrapCommand: string;
}

/** Shared SuPi configuration section owned by this package. */
export const AGENT_CONFIG_SECTION = "agent";
/** Defaults that retain Agent Run availability. */
export const AGENT_DEFAULTS: AgentConfig = {
  agentToolEnabled: true,
  maxConcurrentRuns: 4,
  bootstrapCommand: "",
};

/** Load merged and normalized Agent Run settings. */
export function loadAgentConfig(cwd: string, homeDir?: string): AgentConfig {
  const raw = loadSupiConfig(AGENT_CONFIG_SECTION, cwd, AGENT_DEFAULTS, { homeDir });
  const agentToolEnabled =
    typeof raw.agentToolEnabled === "boolean"
      ? raw.agentToolEnabled
      : AGENT_DEFAULTS.agentToolEnabled;
  const maxConcurrentRuns =
    typeof raw.maxConcurrentRuns === "number" &&
    Number.isSafeInteger(raw.maxConcurrentRuns) &&
    raw.maxConcurrentRuns > 0
      ? raw.maxConcurrentRuns
      : AGENT_DEFAULTS.maxConcurrentRuns;
  const bootstrapCommand =
    typeof raw.bootstrapCommand === "string" ? raw.bootstrapCommand.trim() : "";
  return { agentToolEnabled, maxConcurrentRuns, bootstrapCommand };
}

/** Activate Agent Run only when its setting is on and the current catalogue has usable profiles. */
export function syncAgentRunTool(pi: ExtensionAPI, cwd: string, homeDir?: string): void {
  const activeTools = pi.getActiveTools();
  const enabled =
    loadAgentConfig(cwd, homeDir).agentToolEnabled &&
    (agentProfileCatalogueStore.get()?.profileIds.length ?? 0) > 0;
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
        {
          kind: "number",
          key: "maxConcurrentRuns",
          label: "Active Agent Run limit",
          description:
            "Positive integer. Count foreground and background Agent Runs together; exclude Reviews. Lowering the limit does not stop active runs.",
          values: ["1", "2", "4", "8", "16"],
        },
        {
          kind: "string",
          key: "bootstrapCommand",
          label: "Worktree bootstrap command",
          description:
            "Run once in each worktree agent_run creates (new.worktree) before its task starts, for example pnpm install. Empty runs none.",
        },
      ],
      afterPersist: ({ cwd }) => syncAgentRunTool(pi, cwd, homeDir),
      ...(homeDir ? { homeDir } : {}),
    }),
  );
}
