// Config-aware settings helper for SuPi config-backed settings sections.
// Wraps registerSettings() and centralizes selected-scope loading + scoped persistence.

import type { SettingItem } from "@mariozechner/pi-tui";
import { loadSupiConfigForScope, removeSupiConfigKey, writeSupiConfig } from "./config.ts";
import type { SettingsScope } from "./settings-registry.ts";
import { registerSettings } from "./settings-registry.ts";

export interface ConfigSettingsHelpers {
  /** Write a key to the selected scope's config section. */
  set(key: string, value: unknown): void;
  /** Remove a key from the selected scope's config section. */
  unset(key: string): void;
}

export interface ConfigSettingsOptions<T> {
  /** Extension identifier — e.g. "lsp", "claude-md" */
  id: string;
  /** Human-readable label shown in the UI */
  label: string;
  /** SuPi config section name — e.g. "lsp", "claude-md" */
  section: string;
  /** Default config values */
  defaults: T;
  /** Build SettingItem[] from scoped config. Called by loadValues. */
  buildItems: (settings: T, scope: SettingsScope, cwd: string) => SettingItem[];
  /** Handle a settings change with scoped persistence helpers. */
  persistChange: (
    scope: SettingsScope,
    cwd: string,
    settingId: string,
    value: string,
    helpers: ConfigSettingsHelpers,
  ) => void;
}

/**
 * Register a config-backed settings section.
 *
 * Loads display values from the selected scope only (`defaults <- selected scope`)
 * instead of merged effective runtime config. Provides scoped `set` / `unset`
 * persistence helpers so extensions don't need to wire `writeSupiConfig` /
 * `removeSupiConfigKey` by hand.
 */
export function registerConfigSettings<T>(options: ConfigSettingsOptions<T>): void {
  registerSettings({
    id: options.id,
    label: options.label,
    loadValues: (scope, cwd) => {
      const settings = loadSupiConfigForScope(options.section, cwd, options.defaults, { scope });
      return options.buildItems(settings, scope, cwd);
    },
    persistChange: (scope, cwd, settingId, value) => {
      const helpers: ConfigSettingsHelpers = {
        set: (key, val) => {
          writeSupiConfig({ section: options.section, scope, cwd }, { [key]: val });
        },
        unset: (key) => {
          removeSupiConfigKey({ section: options.section, scope, cwd }, key);
        },
      };
      options.persistChange(scope, cwd, settingId, value, helpers);
    },
  });
}
