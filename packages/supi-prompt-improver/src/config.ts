import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { loadSupiConfig } from "@mrclrchtr/supi-core/config";
import { defineConfigSettings, registerSettings } from "@mrclrchtr/supi-core/settings";

/** Settings used by the command-based prompt improver. */
export interface PromptImproverConfig extends Record<string, unknown> {
  /** Canonical `provider/model-id` value, or `disabled`. */
  model: string;
}

/** The shared SuPi settings section owned by this extension. */
export const PROMPT_IMPROVER_CONFIG_SECTION = "promptImprover";

/** Safe default: the feature sends no request until a model is selected. */
export const PROMPT_IMPROVER_DEFAULTS: PromptImproverConfig = {
  model: "disabled",
};

/** Read the merged global and project configuration. */
export function loadPromptImproverConfig(cwd: string): PromptImproverConfig {
  const raw = loadSupiConfig(PROMPT_IMPROVER_CONFIG_SECTION, cwd, PROMPT_IMPROVER_DEFAULTS);
  const model = typeof raw.model === "string" && raw.model.trim() ? raw.model.trim() : "disabled";
  return { model };
}

/** Add the dedicated model picker to `/supi-settings`. */
export function registerPromptImproverSettings(pi: ExtensionAPI): void {
  registerSettings(
    pi,
    defineConfigSettings({
      id: PROMPT_IMPROVER_CONFIG_SECTION,
      label: "Prompt improver",
      section: PROMPT_IMPROVER_CONFIG_SECTION,
      defaults: PROMPT_IMPROVER_DEFAULTS,
      fields: [
        {
          kind: "modelPicker",
          key: "model",
          label: "Improver model",
          description: "Model used by /supi-improve. Select disabled to stop requests.",
          includeDisabled: true,
        },
      ],
    }),
  );
}
