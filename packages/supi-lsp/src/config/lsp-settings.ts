// LSP settings used by workspace lifecycle and automatic path policy.

import { loadSupiConfig } from "@mrclrchtr/supi-core/config";

/** Effective non-server LSP settings. */
export interface LspSettings {
  exclude: string[];
}

export const LSP_DEFAULTS: LspSettings = {
  exclude: [],
};

/** Load effective LSP settings for one workspace. */
export function loadLspSettings(cwd: string, homeDir?: string): LspSettings {
  const loaded = loadSupiConfig("lsp", cwd, LSP_DEFAULTS, { homeDir });
  return {
    exclude: Array.isArray(loaded.exclude)
      ? loaded.exclude.filter((entry): entry is string => typeof entry === "string")
      : [],
  };
}
