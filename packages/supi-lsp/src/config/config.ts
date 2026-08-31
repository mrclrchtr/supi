// LSP server configuration — load defaults, merge with supi config per language key.

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { loadSupiConfigForScope } from "@mrclrchtr/supi-core/config";
import { truncateDebugIdentity } from "@mrclrchtr/supi-core/debug";
import type { LspConfig, ServerConfig } from "./types.ts";

const CONFIG_DIR = path.dirname(fileURLToPath(import.meta.url));

// Load defaults at module level — resolve relative to this file.
const DEFAULTS: LspConfig = JSON.parse(
  fs.readFileSync(path.join(CONFIG_DIR, "defaults.json"), "utf-8"),
) as LspConfig;

// ── Public API ────────────────────────────────────────────────────────

export interface LoadConfigOptions {
  homeDir?: string;
}

/** Map from language alias → canonical config key. */
export const LANGUAGE_ALIASES: Record<string, string> = {
  cpp: "c",
};

function resolveAliasesInOverrides(servers: Record<string, unknown>): void {
  for (const [alias, target] of Object.entries(LANGUAGE_ALIASES)) {
    if (!Object.hasOwn(servers, alias)) continue;
    const aliasOverride = servers[alias];
    const targetOverride = servers[target];
    servers[target] =
      isRecord(aliasOverride) && isRecord(targetOverride)
        ? { ...targetOverride, ...aliasOverride }
        : aliasOverride;
    delete servers[alias];
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
    { servers: {} as Record<string, ServerConfig> },
    { scope: "global", homeDir: options?.homeDir },
  );
  const projectLsp = loadSupiConfigForScope(
    "lsp",
    cwd,
    { servers: {} as Record<string, ServerConfig> },
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
  const warnings = new Map<string, { fields: Set<string>; skipped: boolean }>();
  const reportWarning: ServerConfigWarningReporter = (name, fields, skipped) => {
    const warning = warnings.get(name) ?? { fields: new Set<string>(), skipped: false };
    for (const field of fields) warning.fields.add(field);
    warning.skipped ||= skipped;
    warnings.set(name, warning);
  };

  const globalServers = isServerRecord(globalOverrides) ? globalOverrides : {};
  const projectServers = isServerRecord(projectOverrides) ? projectOverrides : {};

  resolveAliasesInOverrides(globalServers);
  resolveAliasesInOverrides(projectServers);

  // Apply global per-key overrides against defaults
  for (const [lang, override] of Object.entries(globalServers)) {
    const builtIn = defaults[lang] !== undefined;
    const result = mergeSingleServer({
      name: lang,
      base: defaults[lang],
      value: override,
      builtIn,
      reportWarning,
    });
    if (result) merged[lang] = result;
  }

  // Apply project per-key overrides against the result so far
  for (const [lang, override] of Object.entries(projectServers)) {
    const builtIn = defaults[lang] !== undefined;
    const result = mergeSingleServer({
      name: lang,
      base: merged[lang] ?? defaults[lang],
      value: override,
      builtIn,
      reportWarning,
    });
    if (result) merged[lang] = result;
    else if (!builtIn) delete merged[lang];
  }

  // Remove servers whose final merged config has enabled === false
  for (const [lang, config] of Object.entries(merged)) {
    if (config.enabled === false) {
      delete merged[lang];
    }
  }

  for (const [name, warning] of warnings) {
    warnInvalidServerConfig(name, [...warning.fields], warning.skipped);
  }
  return merged;
}

type ServerConfigWarningReporter = (
  name: string,
  fields: readonly string[],
  skipped: boolean,
) => void;

function mergeSingleServer(options: {
  name: string;
  base: ServerConfig | undefined;
  value: unknown;
  builtIn: boolean;
  reportWarning: ServerConfigWarningReporter;
}): ServerConfig | null {
  const { name, base, value, builtIn, reportWarning } = options;
  const { override, invalidFields } = validateServerOverride(value);
  const missingFields = base
    ? []
    : [
        ...(typeof override.command === "string" ? [] : ["command"]),
        ...(override.fileTypes && override.fileTypes.length > 0 ? [] : ["fileTypes"]),
      ];
  const issues = [...new Set([...invalidFields, ...missingFields])];
  if ((!builtIn && invalidFields.length > 0) || (!base && issues.length > 0)) {
    reportWarning(name, issues, true);
    return null;
  }
  if (!base) {
    return {
      ...override,
      command: override.command as string,
      fileTypes: override.fileTypes as string[],
      rootMarkers: override.rootMarkers ?? [],
    };
  }

  if (invalidFields.length > 0) reportWarning(name, invalidFields, false);
  return { ...base, ...override };
}

type ServerOverrideSetter = (override: Partial<ServerConfig>, candidate: unknown) => boolean;

const SERVER_OVERRIDE_SETTERS: Record<string, ServerOverrideSetter> = {
  command(override, candidate) {
    if (typeof candidate !== "string" || candidate.trim().length === 0) return false;
    override.command = candidate;
    return true;
  },
  args(override, candidate) {
    if (!isStringArray(candidate)) return false;
    override.args = candidate;
    return true;
  },
  fileTypes(override, candidate) {
    if (!isNonEmptyStringArray(candidate)) return false;
    override.fileTypes = candidate;
    return true;
  },
  rootMarkers(override, candidate) {
    if (!isStringArray(candidate)) return false;
    override.rootMarkers = candidate;
    return true;
  },
  enabled(override, candidate) {
    if (typeof candidate !== "boolean") return false;
    override.enabled = candidate;
    return true;
  },
  env(override, candidate) {
    if (!isStringRecord(candidate)) return false;
    override.env = candidate;
    return true;
  },
  initializationOptions(override, candidate) {
    override.initializationOptions = candidate;
    return true;
  },
  readinessTimeoutMs(override, candidate) {
    if (typeof candidate !== "number" || !Number.isFinite(candidate) || candidate <= 0) {
      return false;
    }
    override.readinessTimeoutMs = candidate;
    return true;
  },
};

function validateServerOverride(value: unknown): {
  override: Partial<ServerConfig>;
  invalidFields: string[];
} {
  if (!isRecord(value)) return { override: {}, invalidFields: ["definition"] };
  const override: Partial<ServerConfig> = {};
  const invalidFields: string[] = [];

  for (const [field, candidate] of Object.entries(value)) {
    const setter = SERVER_OVERRIDE_SETTERS[field];
    if (!setter?.(override, candidate)) invalidFields.push(field);
  }

  return { override, invalidFields };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isNonEmptyStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((entry) => typeof entry === "string" && entry.length > 0)
  );
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === "string");
}

function warnInvalidServerConfig(name: string, fields: readonly string[], skipped: boolean): void {
  const boundedName = truncateDebugIdentity(name);
  const boundedFields = truncateDebugIdentity(fields.join(", "));
  const action = skipped ? "Skipped invalid" : "Ignored invalid fields in";
  // biome-ignore lint/suspicious/noConsole: malformed user configuration must be visible.
  console.warn(`[supi-lsp] ${action} LSP server configuration "${boundedName}": ${boundedFields}`);
}

function isServerRecord(value: unknown): value is Record<string, unknown> {
  return isRecord(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
