/**
 * Settings registration for supi-prompt-suggestions.
 *
 * Registers a `promptSuggestions` section with a single `model` picker
 * that shows `disabled` first, then the scoped model set.
 *
 * @module
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { defineConfigSettings, registerSettings } from "@mrclrchtr/supi-core/settings";
import { CONFIG_SECTION, DEFAULTS } from "./config.ts";

/** Register the prompt-suggestions settings section. */
export function registerPromptSuggestionsSettings(pi: ExtensionAPI): void {
  registerSettings(
    pi,
    defineConfigSettings({
      id: "promptSuggestions",
      label: "Prompt suggestions",
      section: CONFIG_SECTION,
      defaults: DEFAULTS,
      fields: [
        {
          kind: "modelPicker" as const,
          key: "model",
          label: "Suggestion model",
          description: "Model used for ghost-text suggestions. Select 'disabled' to turn off.",
        },
      ],
    }),
  );
}
