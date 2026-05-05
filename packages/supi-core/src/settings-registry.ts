// Settings registry for SuPi extensions.
//
// Extensions declare their settings via `registerSettings()` during their
// factory function. The generic settings UI reads them via `getRegisteredSettings()`.

import type { SettingItem } from "@mariozechner/pi-tui";
import { createRegistry } from "./registry-utils.ts";

export type SettingsScope = "project" | "global";

export interface SettingsSection {
  /** Extension identifier — e.g. "lsp", "claude-md" */
  id: string;
  /** Human-readable label shown in the UI */
  label: string;
  /** Load current SettingItem[] for the given scope */
  loadValues: (scope: SettingsScope, cwd: string) => SettingItem[];
  /** Persist a change back to config */
  persistChange: (scope: SettingsScope, cwd: string, settingId: string, value: string) => void;
}

const registry = createRegistry<SettingsSection>("settings-registry");

/**
 * Register a settings section for an extension.
 * Call during the extension factory function (not async handlers).
 * Duplicate ids replace the previous registration.
 */
export function registerSettings(section: SettingsSection): void {
  registry.register(section.id, section);
}

/** Get all registered settings sections in registration order. */
export function getRegisteredSettings(): SettingsSection[] {
  return registry.getAll();
}

/** Clear the registry — used by tests. */
export function clearRegisteredSettings(): void {
  registry.clear();
}
