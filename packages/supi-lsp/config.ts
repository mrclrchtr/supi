// LSP server configuration — load defaults, merge with project overrides.

import * as fs from "node:fs";
import * as path from "node:path";
import type { LspConfig, ServerConfig } from "./types.ts";

// Load defaults at module level — resolve relative to this file.
// pi loads extensions via jiti, which always provides __dirname.
const DEFAULTS: LspConfig = JSON.parse(
  fs.readFileSync(path.join(__dirname, "defaults.json"), "utf-8"),
) as LspConfig;

// ── Public API ────────────────────────────────────────────────────────

/**
 * Load LSP config: built-in defaults merged with optional `.pi-lsp.json`
 * from the project root. Project config takes precedence.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: straightforward merge logic
export function loadConfig(cwd: string): LspConfig {
  const defaults = DEFAULTS;
  const projectOverrides = loadProjectConfig(cwd);

  // Start from defaults, merge project overrides if present
  const merged: Record<string, ServerConfig> = { ...defaults.servers };

  if (projectOverrides) {
    for (const [name, override] of Object.entries(projectOverrides.servers)) {
      if (override.enabled === false) {
        delete merged[name];
        continue;
      }
      if (merged[name]) {
        merged[name] = { ...merged[name], ...override };
      } else {
        // New server from project config — must have all required fields
        if (override.command && override.fileTypes && override.rootMarkers) {
          merged[name] = override as ServerConfig;
        }
      }
    }
  }

  // Apply PI_LSP_SERVERS filter (always, even without project config)
  const allowList = getServerAllowList();
  if (allowList) {
    for (const name of Object.keys(merged)) {
      if (!allowList.has(name)) {
        delete merged[name];
      }
    }
  }

  return { servers: merged };
}

/**
 * Find which server config handles a given file extension.
 * Returns [serverName, config] or null.
 */
export function getServerForFile(
  config: LspConfig,
  filePath: string,
): [string, ServerConfig] | null {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  if (!ext) return null;

  for (const [name, server] of Object.entries(config.servers)) {
    if (server.fileTypes.includes(ext)) {
      return [name, server];
    }
  }
  return null;
}

// ── Private ───────────────────────────────────────────────────────────

function loadProjectConfig(cwd: string): LspConfig | null {
  const jsonPath = path.join(cwd, ".pi-lsp.json");

  if (fs.existsSync(jsonPath)) {
    try {
      const content = fs.readFileSync(jsonPath, "utf-8");
      return JSON.parse(content) as LspConfig;
    } catch {}
  }

  return null;
}

function getServerAllowList(): Set<string> | null {
  const env = process.env.PI_LSP_SERVERS;
  if (!env) return null;
  const names = env
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return names.length > 0 ? new Set(names) : null;
}
