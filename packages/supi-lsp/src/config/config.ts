// LSP server configuration — load defaults, merge with supi config per language key.

import * as fs from "node:fs";
import * as path from "node:path";
import { loadSupiConfigForScope } from "@mrclrchtr/supi-core/api";
import type { LspConfig, ServerConfig } from "./types.ts";

// Load defaults at module level — resolve relative to this file.
// pi loads extensions via jiti, which always provides __dirname.
const DEFAULTS: LspConfig = JSON.parse(
  fs.readFileSync(path.join(__dirname, "defaults.json"), "utf-8"),
) as LspConfig;

// ── Public API ────────────────────────────────────────────────────────

export interface LoadConfigOptions {
  homeDir?: string;
}

/** Map from language alias → canonical config key. */
export const LANGUAGE_ALIASES: Record<string, string> = {
  cpp: "c",
};

/** Resolve a language name through aliases. */
export function resolveLanguageAlias(name: string): string {
  return LANGUAGE_ALIASES[name] ?? name;
}

function resolveAliasesInOverrides(servers: Record<string, Partial<ServerConfig>>): void {
  for (const [alias, target] of Object.entries(LANGUAGE_ALIASES)) {
    if (servers[alias]) {
      servers[target] = { ...(servers[target] ?? {}), ...servers[alias] };
      delete servers[alias];
    }
  }
}

/**
 * Load LSP config: built-in defaults merged with per-language-key overrides
 * from supi config (`~/.pi/agent/supi/config.json` and `.pi/supi/config.json`).
 * Each language key merges individually; omitted fields fall back to defaults.
 */
export function loadConfig(cwd: string, options?: LoadConfigOptions): LspConfig {
  const defaults = DEFAULTS;

  const globalLsp = loadSupiConfigForScope(
    "lsp",
    cwd,
    { enabled: true, severity: 1, active: [], servers: {} as Record<string, ServerConfig> },
    { scope: "global", homeDir: options?.homeDir },
  );
  const projectLsp = loadSupiConfigForScope(
    "lsp",
    cwd,
    { enabled: true, severity: 1, active: [], servers: {} as Record<string, ServerConfig> },
    { scope: "project" },
  );

  const merged = mergeServerConfigs(defaults.servers, globalLsp.servers, projectLsp.servers);

  return { servers: merged };
}

/**
 * Find which server config handles a given file extension.
 * Returns [languageName, config] or null.
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

function mergeServerConfigs(
  defaults: Record<string, ServerConfig>,
  globalOverrides: unknown,
  projectOverrides: unknown,
): Record<string, ServerConfig> {
  const merged: Record<string, ServerConfig> = { ...defaults };

  const globalServers = isServerRecord(globalOverrides) ? globalOverrides : {};
  const projectServers = isServerRecord(projectOverrides) ? projectOverrides : {};

  resolveAliasesInOverrides(globalServers);
  resolveAliasesInOverrides(projectServers);

  // Apply global per-key overrides against defaults
  for (const [lang, override] of Object.entries(globalServers)) {
    const result = mergeSingleServer(defaults[lang], override);
    if (result) merged[lang] = result;
  }

  // Apply project per-key overrides against the result so far
  for (const [lang, override] of Object.entries(projectServers)) {
    const result = mergeSingleServer(merged[lang] ?? defaults[lang], override);
    if (result) merged[lang] = result;
  }

  // Remove servers whose final merged config has enabled === false
  for (const [lang, config] of Object.entries(merged)) {
    if (config.enabled === false) {
      delete merged[lang];
    }
  }

  return merged;
}

function mergeSingleServer(
  base: ServerConfig | undefined,
  override: Partial<ServerConfig>,
): ServerConfig | null {
  if (!base) {
    // New custom language — must have all required fields
    if (
      override.command &&
      Array.isArray(override.fileTypes) &&
      override.fileTypes.length > 0 &&
      Array.isArray(override.rootMarkers) &&
      override.rootMarkers.length > 0
    ) {
      return override as ServerConfig;
    }
    return null;
  }
  return { ...base, ...override };
}

function isServerRecord(value: unknown): value is Record<string, Partial<ServerConfig>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
