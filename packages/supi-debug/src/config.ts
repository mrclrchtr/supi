// Debug config loading and live registry synchronization.

import { loadSupiConfig } from "@mrclrchtr/supi-core/config";
import {
  clearDebugEvents,
  configureDebugRegistry,
  DEBUG_REGISTRY_DEFAULTS,
  type DebugAgentAccess,
} from "@mrclrchtr/supi-core/debug";

export const DEBUG_SECTION = "debug";

export interface DebugConfig extends Record<string, unknown> {
  enabled: boolean;
  agentAccess: DebugAgentAccess;
  maxEvents: number;
  agentRunRetrospectivesEnabled: boolean;
}

export const DEBUG_DEFAULTS: DebugConfig = { ...DEBUG_REGISTRY_DEFAULTS };

function normalizeAgentAccess(value: string): DebugAgentAccess {
  return value === "off" || value === "raw" ? value : "sanitized";
}

export function normalizeMaxEvents(value: string | number): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEBUG_DEFAULTS.maxEvents;
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (
      normalized === "true" ||
      normalized === "on" ||
      normalized === "1" ||
      normalized === "yes"
    ) {
      return true;
    }
    if (
      normalized === "false" ||
      normalized === "off" ||
      normalized === "0" ||
      normalized === "no" ||
      normalized === ""
    ) {
      return false;
    }
    return fallback;
  }

  if (value === 1) return true;
  if (value === 0) return false;
  return fallback;
}

export function loadDebugConfig(cwd: string): DebugConfig {
  const config = loadSupiConfig(DEBUG_SECTION, cwd, DEBUG_DEFAULTS);
  return {
    enabled: normalizeBoolean(config.enabled, DEBUG_DEFAULTS.enabled),
    agentAccess: normalizeAgentAccess(String(config.agentAccess)),
    maxEvents: normalizeMaxEvents(config.maxEvents),
    agentRunRetrospectivesEnabled: normalizeBoolean(
      config.agentRunRetrospectivesEnabled,
      DEBUG_DEFAULTS.agentRunRetrospectivesEnabled,
    ),
  };
}

export function applyDebugConfig(cwd: string): DebugConfig {
  const config = loadDebugConfig(cwd);
  configureDebugRegistry(config);
  return config;
}

export function syncLiveDebugRegistry(cwd: string): DebugConfig {
  const config = applyDebugConfig(cwd);
  if (!config.enabled) {
    clearDebugEvents();
  }
  return config;
}
