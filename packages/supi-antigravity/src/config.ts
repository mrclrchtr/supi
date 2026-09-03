import { loadSupiConfig } from "@mrclrchtr/supi-core/config";

/** The persisted SuPi configuration section owned by this package. */
export const ANTIGRAVITY_CONFIG_SECTION = "antigravity";

/** Configuration for the Antigravity Run tool. */
export interface AntigravityConfig extends Record<string, unknown> {
  /** Enable availability discovery and the antigravity_run tool. */
  agentToolEnabled: boolean;
}

/** Default Antigravity configuration. */
export const ANTIGRAVITY_DEFAULTS: AntigravityConfig = Object.freeze({
  agentToolEnabled: true,
});

/** Load the effective Antigravity configuration for a workspace. */
export function loadAntigravityConfig(cwd: string, homeDir?: string): AntigravityConfig {
  const raw = loadSupiConfig(ANTIGRAVITY_CONFIG_SECTION, cwd, ANTIGRAVITY_DEFAULTS, { homeDir });
  return {
    agentToolEnabled:
      typeof raw.agentToolEnabled === "boolean"
        ? raw.agentToolEnabled
        : ANTIGRAVITY_DEFAULTS.agentToolEnabled,
  };
}
