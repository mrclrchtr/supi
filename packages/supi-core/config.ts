// Shared config system for SuPi extensions.
//
// Global config: ~/.pi/agent/supi/config.json
// Project config: .pi/supi/config.json (relative to cwd)
// Resolution: hardcoded defaults ← global ← project

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const GLOBAL_CONFIG_DIR = ".pi/agent/supi";
const PROJECT_CONFIG_DIR = ".pi/supi";
const CONFIG_FILE = "config.json";

function getGlobalConfigPath(homeDir?: string): string {
  return path.join(homeDir ?? os.homedir(), GLOBAL_CONFIG_DIR, CONFIG_FILE);
}

function getProjectConfigPath(cwd: string): string {
  return path.join(cwd, PROJECT_CONFIG_DIR, CONFIG_FILE);
}

function readJsonFile(filePath: string): Record<string, unknown> | null {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(content);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function shallowMerge<T>(base: T, ...overrides: Array<Record<string, unknown> | null>): T {
  let result = { ...base };
  for (const override of overrides) {
    if (!override) continue;
    result = { ...result, ...override };
  }
  return result;
}

export interface SupiConfigOptions {
  homeDir?: string;
}

/**
 * Load and merge config for a given extension section.
 *
 * Resolution order: defaults ← global ← project
 */
export function loadSupiConfig<T>(
  section: string,
  cwd: string,
  defaults: T,
  options?: SupiConfigOptions,
): T {
  const globalConfig = readJsonFile(getGlobalConfigPath(options?.homeDir));
  const projectConfig = readJsonFile(getProjectConfigPath(cwd));

  const globalSection = extractSection(globalConfig, section);
  const projectSection = extractSection(projectConfig, section);

  return shallowMerge(defaults, globalSection, projectSection);
}

/**
 * Load config for a single scope only.
 *
 * Resolution order: defaults ← selected scope
 *
 * This is useful for settings UIs that need to show the raw values stored in
 * one scope, rather than the effective merged config.
 */
export function loadSupiConfigForScope<T>(
  section: string,
  cwd: string,
  defaults: T,
  options: { scope: "global" | "project" } & SupiConfigOptions,
): T {
  const config =
    options.scope === "global"
      ? readJsonFile(getGlobalConfigPath(options.homeDir))
      : readJsonFile(getProjectConfigPath(cwd));

  const scopedSection = extractSection(config, section);
  return shallowMerge(defaults, scopedSection);
}

export interface SupiConfigLocation {
  section: string;
  scope: "global" | "project";
  cwd: string;
}

/**
 * Write config values for a given extension section.
 */
export function writeSupiConfig(
  loc: SupiConfigLocation,
  value: Record<string, unknown>,
  options?: SupiConfigOptions,
): void {
  const configPath =
    loc.scope === "global" ? getGlobalConfigPath(options?.homeDir) : getProjectConfigPath(loc.cwd);

  const dir = path.dirname(configPath);
  fs.mkdirSync(dir, { recursive: true });

  const existing = readJsonFile(configPath) ?? {};
  existing[loc.section] = {
    ...((existing[loc.section] as Record<string, unknown>) ?? {}),
    ...value,
  };

  fs.writeFileSync(configPath, `${JSON.stringify(existing, null, 2)}\n`, "utf-8");
}

/**
 * Remove a key from a config section.
 * Used by `interval default` to remove the project override.
 */
export function removeSupiConfigKey(
  loc: SupiConfigLocation,
  key: string,
  options?: SupiConfigOptions,
): void {
  const configPath =
    loc.scope === "global" ? getGlobalConfigPath(options?.homeDir) : getProjectConfigPath(loc.cwd);

  const existing = readJsonFile(configPath);
  if (!existing) return;

  const sectionData = existing[loc.section] as Record<string, unknown> | undefined;
  if (!sectionData) return;

  delete sectionData[key];

  if (Object.keys(sectionData).length === 0) {
    delete existing[loc.section];
  }

  const dir = path.dirname(configPath);
  fs.mkdirSync(dir, { recursive: true });

  const content = Object.keys(existing).length > 0 ? `${JSON.stringify(existing, null, 2)}\n` : "";

  if (content) {
    fs.writeFileSync(configPath, content, "utf-8");
  } else {
    try {
      fs.unlinkSync(configPath);
    } catch {
      // File may not exist
    }
  }
}

function extractSection(
  config: Record<string, unknown> | null,
  section: string,
): Record<string, unknown> | null {
  if (!config) return null;
  const data = config[section];
  if (typeof data === "object" && data !== null && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return null;
}
