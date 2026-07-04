// Config-aware settings contribution helper for SuPi packages.
//
// Registers config-backed settings sections through PI's shared event bus so
// /supi-settings can collect contributions from all loaded extensions without
// relying on a shared supi-core module instance.

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { SettingItem } from "@earendil-works/pi-tui";
import {
  isSettingsContributionCollector,
  type SettingsScope,
  type SettingsSection,
  SUPI_SETTINGS_COLLECT_EVENT,
} from "../settings/settings-registry.ts";
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

/** Extended setting item that can declare its config type for persistence. */
export interface ConfigSettingItem extends SettingItem {
  /** Config value type used for auto-generated persistence. */
  configType?: ConfigSettingType;
}

/** Helpers provided to persistChange for scoped SuPi config writes. */
export interface ConfigSettingsHelpers {
  /** Write a key to the selected scope's config section. */
  set(key: string, value: unknown): void;
  /** Remove a key from the selected scope's config section. */
  unset(key: string): void;
}

export interface ConfigSettingsPersistedChange {
  scope: SettingsScope;
  cwd: string;
  settingId: string;
  value: string;
}

export interface ConfigSettingsOptions<T> {
  /** Settings contribution identifier — e.g. "lsp", "claude-md". */
  id: string;
  /** Human-readable label shown in the UI. */
  label: string;
  /** SuPi config section name — e.g. "lsp", "claude-md". */
  section: string;
  /** Default config values. */
  defaults: T;
  /** Build SettingItem[] from scoped config. */
  buildItems: (
    settings: T,
    scope: SettingsScope,
    cwd: string,
    ctx?: ExtensionContext,
  ) => ConfigSettingItem[];
  /**
   * Convert a UI value into scoped SuPi config writes.
   *
   * Optional when every item returned by `buildItems` declares `configType`.
   * Required when any item lacks `configType`.
   */
  persistChange?: (
    scope: SettingsScope,
    cwd: string,
    settingId: string,
    value: string,
    helpers: ConfigSettingsHelpers,
  ) => void;
  /** Optional live runtime sync after successful persistence. */
  afterPersist?: (change: ConfigSettingsPersistedChange) => void;
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

function createHelpers<T>(options: ConfigSettingsOptions<T>, scope: SettingsScope, cwd: string) {
  return {
    set: (key: string, val: unknown) => {
      writeSupiConfig(
        { section: options.section, scope, cwd },
        { [key]: val },
        { homeDir: options.homeDir },
      );
    },
    unset: (key: string) => {
      removeSupiConfigKey({ section: options.section, scope, cwd }, key, {
        homeDir: options.homeDir,
      });
    },
  } satisfies ConfigSettingsHelpers;
}

function toSettingsSection<T>(options: ConfigSettingsOptions<T>): SettingsSection {
  let cachedItems: ConfigSettingItem[] | undefined;

  return {
    id: options.id,
    label: options.label,
    loadValues: (scope, cwd, ctx) => {
      const settings = loadSupiConfigForScope(options.section, cwd, options.defaults, {
        scope,
        homeDir: options.homeDir,
      });
      const items = options.buildItems(settings, scope, cwd, ctx);
      cachedItems = items;
      return items;
    },
    persistChange: (scope, cwd, settingId, value) => {
      const helpers = createHelpers(options, scope, cwd);

      if (options.persistChange) {
        options.persistChange(scope, cwd, settingId, value, helpers);
      } else {
        const items = cachedItems ?? options.buildItems(options.defaults, scope, cwd, undefined);
        if (!areAllItemsDeclarative(items)) {
          throw new Error(
            `Settings contribution "${options.id}" needs persistChange or configType on every item.`,
          );
        }
        autoPersistChange(settingId, value, helpers, items);
      }

      try {
        options.afterPersist?.({ scope, cwd, settingId, value });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Saved setting, but live sync failed: ${message}`, { cause: error });
      }
    },
  };
}

// ── Registration ───────────────────────────────────────────────────────────

/**
 * Register a config-backed settings contribution for `/supi-settings`.
 *
 * Contributions are collected through PI's process-local event bus. Call this
 * during the extension factory function, not in async session handlers.
 */
export function registerConfigSettings<T>(
  pi: ExtensionAPI,
  options: ConfigSettingsOptions<T>,
): void {
  const section = toSettingsSection(options);
  const dispose = pi.events.on(SUPI_SETTINGS_COLLECT_EVENT, (collector) => {
    if (isSettingsContributionCollector(collector)) {
      collector.add(section);
    }
  });

  pi.on("session_shutdown", () => {
    dispose();
  });
}
