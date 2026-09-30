import { loadSupiConfig } from "@mrclrchtr/supi-core/config";

/** The persisted SuPi configuration section owned by this package. */
export const CONSULTING_CONFIG_SECTION = "consulting";

/** Configuration for Consulting availability and the consulting_run tool. */
export interface ConsultingConfig extends Record<string, unknown> {
  /** Enable agent availability discovery and the consulting_run tool. */
  agentToolEnabled: boolean;
}

/** Default Consulting configuration. */
export const CONSULTING_DEFAULTS: ConsultingConfig = Object.freeze({
  agentToolEnabled: true,
});

/** Load only the new consulting configuration section for a workspace. */
export function loadConsultingConfig(cwd: string, homeDir?: string): ConsultingConfig {
  const raw = loadSupiConfig(CONSULTING_CONFIG_SECTION, cwd, CONSULTING_DEFAULTS, { homeDir });
  return {
    agentToolEnabled:
      typeof raw.agentToolEnabled === "boolean"
        ? raw.agentToolEnabled
        : CONSULTING_DEFAULTS.agentToolEnabled,
  };
}
