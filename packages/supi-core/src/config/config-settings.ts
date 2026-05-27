// Config-aware settings helper for SuPi config-backed settings sections.
// Wraps registerSettings() and centralizes selected-scope loading + scoped persistence.
//
// Setting items can declare a `configType` ("boolean" | "number" | "stringList")
// to enable auto-generated persistChange. When all items have a configType,
// the persistChange callback can be omitted.

import type { SettingItem } from "@earendil-works/pi-tui";
import type { SettingsScope } from "../settings/settings-registry.ts";
import { registerSettings } from "../settings/settings-registry.ts";
import { loadSupiConfigForScope, removeSupiConfigKey, writeSupiConfig } from "./config.ts";

// ── Types ──────────────────────────────────────────────────────────────────

/**
 * Supported config value types for declarative persistChange.
 *
 * - `"boolean"`: maps "on" → true, "off" → false
 * - `"number"`: parses integer via Number.parseInt, falls back to unset on invalid
 * - `"stringList"`: splits on comma, trims whitespace, unsets on empty
 */
export type ConfigSettingType = "boolean" | "number" | "stringList";

/**
 * Extended setting item that can declare its config type for auto-generated
 * persistence handling.
 */
export interface ConfigSettingItem extends SettingItem {
  /**
   * When set, persistChange for this item is auto-generated.
   * All items must declare a configType for auto-generation to activate.
   */
  configType?: ConfigSettingType;
}

/**
 * Helpers provided to the persistChange callback for writing or removing
 * scoped config values.
 */
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
  /**
   * Build SettingItem[] from scoped config. Called by loadValues.
   *
   * Items can include a `configType` property for auto-generated
   * persistChange handling. When ALL items declare a configType,
   * the `persistChange` callback can be omitted.
   */
  buildItems: (settings: T, scope: SettingsScope, cwd: string) => ConfigSettingItem[];
  /**
   * Handle a settings change with scoped persistence helpers.
   *
   * Optional when all items returned by `buildItems` declare a `configType`.
   * Required when any item lacks a `configType`.
   */
  persistChange?: (
    scope: SettingsScope,
    cwd: string,
    settingId: string,
    value: string,
    helpers: ConfigSettingsHelpers,
  ) => void;
  /** Optional home directory for config resolution (testing). */
  homeDir?: string;
}

// ── Auto-generated persistChange ───────────────────────────────────────────

function autoPersistChange(
  settingId: string,
  value: string,
  helpers: ConfigSettingsHelpers,
  items: ConfigSettingItem[],
): void {
  const item = items.find((i) => i.id === settingId);
  if (!item?.configType) return;

  switch (item.configType) {
    case "boolean": {
      helpers.set(settingId, value === "on");
      break;
    }
    case "number": {
      const num = Number.parseInt(value, 10);
      if (Number.isFinite(num) && num > 0) {
        helpers.set(settingId, num);
      } else {
        helpers.unset(settingId);
      }
      break;
    }
    case "stringList": {
      const names = value
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      if (names.length > 0) {
        helpers.set(settingId, names);
      } else {
        helpers.unset(settingId);
      }
      break;
    }
  }
}

function areAllItemsDeclarative(items: ConfigSettingItem[]): boolean {
  return items.length > 0 && items.every((i) => i.configType !== undefined);
}

// ── Registration ───────────────────────────────────────────────────────────

/**
 * Register a config-backed settings section.
 *
 * Loads display values from the selected scope only (`defaults <- selected scope`)
 * instead of merged effective runtime config. Provides scoped `set` / `unset`
 * persistence helpers so extensions don't need to wire `writeSupiConfig` /
 * `removeSupiConfigKey` by hand.
 *
 * When every item returned by `buildItems` declares a `configType`, the
 * `persistChange` callback is optional and will be auto-generated.
 */
export function registerConfigSettings<T>(options: ConfigSettingsOptions<T>): void {
  let cachedItems: ConfigSettingItem[] | undefined;

  registerSettings({
    id: options.id,
    label: options.label,
    loadValues: (scope, cwd) => {
      const settings = loadSupiConfigForScope(options.section, cwd, options.defaults, {
        scope,
        homeDir: options.homeDir,
      });
      const items = options.buildItems(settings, scope, cwd);
      cachedItems = items;
      return items;
    },
    persistChange: (scope, cwd, settingId, value) => {
      const helpers: ConfigSettingsHelpers = {
        set: (key, val) => {
          writeSupiConfig(
            { section: options.section, scope, cwd },
            { [key]: val },
            { homeDir: options.homeDir },
          );
        },
        unset: (key) => {
          removeSupiConfigKey({ section: options.section, scope, cwd }, key, {
            homeDir: options.homeDir,
          });
        },
      };

      // Use manual persistChange when provided
      if (options.persistChange) {
        options.persistChange(scope, cwd, settingId, value, helpers);
        return;
      }

      // Auto-generate when all items are declarative
      const items = cachedItems ?? options.buildItems(options.defaults, scope, cwd);
      if (areAllItemsDeclarative(items)) {
        autoPersistChange(settingId, value, helpers, items);
      }
    },
  });
}
