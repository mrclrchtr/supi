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
 * Return a user-facing message that indicates which config scope disabled LSP.
 */
export function getLspDisabledMessage(cwd: string, homeDir?: string): string {
  const global = loadSupiConfigForScope("lsp", cwd, LSP_DEFAULTS, { scope: "global", homeDir });
  const project = loadSupiConfigForScope("lsp", cwd, LSP_DEFAULTS, { scope: "project", homeDir });

  if (project.enabled === false) {
    return "LSP is disabled in project settings (.pi/supi/config.json)";
  }
  if (global.enabled === false) {
    return "LSP is disabled in global settings (~/.pi/agent/supi/config.json)";
  }
  return "LSP is disabled in settings";
}
