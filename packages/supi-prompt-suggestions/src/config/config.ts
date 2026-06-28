/**
 * Config types and defaults for supi-prompt-suggestions.
 *
 * @module
 */

export interface PromptSuggestionsConfig extends Record<string, unknown> {
  /** The suggestion model in `provider/model-id` format, or `"disabled"`. */
  model: string;
}

export const DEFAULTS: PromptSuggestionsConfig = {
  model: "disabled",
};

export const CONFIG_SECTION = "promptSuggestions";
