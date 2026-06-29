/**
 * Settings registration for supi-prompt-suggestions.
 *
 * Registers a `promptSuggestions` section with a single `model` picker
 * that shows `disabled` first, then the scoped model set.
 *
 * @module
 */

import { registerConfigSettings } from "@mrclrchtr/supi-core/config";
import { createModelPickerSubmenu } from "@mrclrchtr/supi-core/settings-ui";
import { CONFIG_SECTION, DEFAULTS } from "./config.ts";

const MODEL_ITEM_ID = "model";

/** Register the prompt-suggestions settings section. */
export function registerPromptSuggestionsSettings(): void {
  registerConfigSettings({
    id: "promptSuggestions",
    label: "Prompt suggestions",
    section: CONFIG_SECTION,
    defaults: DEFAULTS,
    buildItems: (settings, _scope, _cwd, ctx) => [
      {
        id: MODEL_ITEM_ID,
        label: "Suggestion model",
        description: "Model used for ghost-text suggestions. Select 'disabled' to turn off.",
        currentValue: settings.model,
        submenu: (currentValue: string, done: (selectedValue?: string) => void) =>
          createModelPickerSubmenu(currentValue, done, ctx),
      },
    ],
    // biome-ignore lint/complexity/useMaxParams: callback shape mandated by registerConfigSettings API
    persistChange: (_scope, _cwd, settingId, value, helpers) => {
      if (settingId === MODEL_ITEM_ID) {
        if (value === "disabled") {
          helpers.unset(MODEL_ITEM_ID);
        } else {
          helpers.set(MODEL_ITEM_ID, value);
        }
      }
    },
  });
}
