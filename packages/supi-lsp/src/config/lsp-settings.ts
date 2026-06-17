// LSP settings helpers — config loading for LSP session lifecycle.
//
// These are the non-UI config helpers extracted from settings-registration.ts
// so they can be consumed by the library-only runtime controller without
// importing pi-specific UI modules.

import { loadSupiConfig, loadSupiConfigForScope } from "@mrclrchtr/supi-core/config";

// ── Types ────────────────────────────────────────────────────

export interface LspSettings {
  enabled: boolean;
  severity: number;
  active: string[];
  exclude: string[];
}

export const LSP_DEFAULTS: LspSettings = {
  enabled: true,
  severity: 1,
  active: [],
  exclude: [],
};

// ── Config helpers ───────────────────────────────────────────

/**
 * Load LSP settings from supi config for the given cwd.
 *
 * Merges project and global scopes with defaults, returning the
 * effective LspSettings for session startup.
 */
export function loadLspSettings(cwd: string, homeDir?: string): LspSettings {
  return loadSupiConfig("lsp", cwd, LSP_DEFAULTS, { homeDir });
}

/**
 * Return a user-facing message explaining why LSP may appear disabled.
 *
 * **Since the always-on policy:** `lsp.enabled: false` is deprecated and
 * ignored. This function is kept for backward compatibility with the
 * settings UI and reports that LSP is always attempted.
 */
export function getLspDisabledMessage(cwd: string, homeDir?: string): string {
  const global = loadSupiConfigForScope("lsp", cwd, LSP_DEFAULTS, { scope: "global", homeDir });
  const project = loadSupiConfigForScope("lsp", cwd, LSP_DEFAULTS, { scope: "project", homeDir });

  if (project.enabled === false) {
    return "LSP is always attempted; `lsp.enabled: false` in project settings (.pi/supi/config.json) is deprecated and ignored";
  }
  if (global.enabled === false) {
    return "LSP is always attempted; `lsp.enabled: false` in global settings (~/.pi/agent/supi/config.json) is deprecated and ignored";
  }
  return "LSP is always attempted";
}

// ── Deprecated-key detection (always-on policy) ────────────────

/**
 * Result of checking for deprecated LSP configuration keys.
 */
export interface DeprecatedLspKeys {
  /** `lsp.enabled` presence in project config. */
  projectEnabled: boolean;
  /** `lsp.enabled` presence in global config. */
  globalEnabled: boolean;
  /** `lsp.active` presence in project config. */
  projectActive: boolean;
  /** `lsp.active` presence in global config. */
  globalActive: boolean;
}

/**
 * Check whether deprecated `lsp.enabled` or `lsp.active` keys exist
 * in project or global config. These keys are ignored by the always-on
 * LSP policy but may be present in user config.
 */
export function getDeprecatedLspKeys(cwd: string, homeDir?: string): DeprecatedLspKeys {
  const global = loadSupiConfigForScope("lsp", cwd, LSP_DEFAULTS, { scope: "global", homeDir });
  const project = loadSupiConfigForScope("lsp", cwd, LSP_DEFAULTS, { scope: "project", homeDir });

  return {
    projectEnabled: hasExplicitEnabledKey(project),
    globalEnabled: hasExplicitEnabledKey(global),
    projectActive: hasExplicitActiveKey(project),
    globalActive: hasExplicitActiveKey(global),
  };
}

/** Whether the loaded settings had an explicit `enabled` key (different from default). */
function hasExplicitEnabledKey(settings: Partial<{ enabled: boolean }>): boolean {
  return settings.enabled === false;
}

/** Whether the loaded settings had an explicit `active` key. */
function hasExplicitActiveKey(settings: Partial<{ active: string[] }>): boolean {
  return Array.isArray(settings.active) && settings.active.length > 0;
}

// Alias for backwards compatibility with the RED test name
/** @deprecated Use {@link getDeprecatedLspKeys} instead. */
export const hasDeprecatedLspKeys: typeof getDeprecatedLspKeys = getDeprecatedLspKeys;
