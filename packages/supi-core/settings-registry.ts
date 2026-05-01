// Settings registry for SuPi extensions.
//
// Extensions declare their settings via `registerSettings()` during their
// factory function. The generic settings UI reads them via `getRegisteredSettings()`.

import type { SettingItem } from "@mariozechner/pi-tui";

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

// Use a globalThis-backed registry so that all jiti module instances
// (resolved through different node_modules symlinks) share the same Map.
// Without this, each symlink path gets its own module copy and its own Map,
// so extensions registering settings write to a different Map than the
// /supi-settings command reads from.
const REGISTRY_KEY = Symbol.for("@mrclrchtr/supi-core/settings-registry");

function getRegistry(): Map<string, SettingsSection> {
  let registry = (globalThis as Record<symbol, unknown>)[REGISTRY_KEY] as
    | Map<string, SettingsSection>
    | undefined;
  if (!registry) {
    registry = new Map<string, SettingsSection>();
    (globalThis as Record<symbol, unknown>)[REGISTRY_KEY] = registry;
  }
  return registry;
}

/**
 * Register a settings section for an extension.
 * Call during the extension factory function (not async handlers).
 * Duplicate ids replace the previous registration.
 */
export function registerSettings(section: SettingsSection): void {
  getRegistry().set(section.id, section);
}

/** Get all registered settings sections in registration order. */
export function getRegisteredSettings(): SettingsSection[] {
  return Array.from(getRegistry().values());
}

/** Clear the registry — used by tests. */
export function clearRegisteredSettings(): void {
  getRegistry().clear();
}
