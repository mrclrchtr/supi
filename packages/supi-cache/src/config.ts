// Configuration for historical cache forensics.

import { loadSupiConfigSectionForScope } from "@mrclrchtr/supi-core/config";

/** Settings that affect cache-forensics queries. */
export interface CacheForensicsConfig extends Record<string, unknown> {
  /** Percentage-point drop used for unknown-cause findings. */
  regressionThreshold: number;
  /** Gap in minutes used to classify unknown findings as idle. */
  idleThresholdMinutes: number;
}

export const CACHE_FORENSICS_DEFAULTS: CacheForensicsConfig = {
  regressionThreshold: 25,
  idleThresholdMinutes: 5,
};

/**
 * Load forensics thresholds from the current or legacy cache section.
 *
 * The old `enabled` and `notifications` settings are intentionally ignored.
 * Pi owns live cache notices through `showCacheMissNotices`.
 */
export function loadCacheForensicsConfig(cwd: string, homeDir?: string): CacheForensicsConfig {
  const legacy = loadSection("cache-monitor", cwd, homeDir);
  const current = loadSection("cache", cwd, homeDir);
  const merged = { ...CACHE_FORENSICS_DEFAULTS, ...legacy, ...current };

  return {
    regressionThreshold: finiteNumber(
      merged.regressionThreshold,
      CACHE_FORENSICS_DEFAULTS.regressionThreshold,
    ),
    idleThresholdMinutes: finiteNumber(
      merged.idleThresholdMinutes,
      CACHE_FORENSICS_DEFAULTS.idleThresholdMinutes,
    ),
  };
}

function loadSection(
  section: string,
  cwd: string,
  homeDir: string | undefined,
): Record<string, unknown> {
  const global = loadSupiConfigSectionForScope(section, cwd, { scope: "global", homeDir }) ?? {};
  const project = loadSupiConfigSectionForScope(section, cwd, { scope: "project", homeDir }) ?? {};
  return { ...global, ...project };
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
