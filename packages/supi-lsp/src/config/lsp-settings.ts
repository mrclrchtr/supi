// LSP settings types and config helpers (pi-independent library surface).
//
// Extracted from the pi-specific settings-registration.ts so
// the umbrella extension adapter can use them without importing
// pi-only modules.

import { loadSupiConfig, loadSupiConfigForScope } from "@mrclrchtr/supi-core/api";

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

export function loadLspSettings(cwd: string, homeDir?: string): LspSettings {
  return loadSupiConfig("lsp", cwd, LSP_DEFAULTS, { homeDir });
}

/**
 * Return a user-facing message that indicates which config scope disabled LSP.
 */
export function getLspDisabledMessage(cwd: string, homeDir?: string): string {
  const global = loadSupiConfigForScope("lsp", cwd, LSP_DEFAULTS, {
    scope: "global",
    homeDir,
  });
  const project = loadSupiConfigForScope("lsp", cwd, LSP_DEFAULTS, {
    scope: "project",
    homeDir,
  });

  if (project.enabled === false) {
    return "LSP is disabled in project settings (.pi/supi/config.json)";
  }
  if (global.enabled === false) {
    return "LSP is disabled in global settings (~/.pi/agent/supi/config.json)";
  }
  return "LSP is disabled in settings";
}

export { loadConfig } from "./config.ts";
export type { LspConfig, ServerConfig } from "./types.ts";
