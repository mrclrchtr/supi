// Configuration for supi-cache.
//
// Config shape (in supi shared config, "supi-cache" section):
// {
//   "enabled": true,              // enable/disable cache monitoring
//   "notifications": true,        // show regression warning notifications
//   "regressionThreshold": 25,    // percentage-point drop that triggers a warning
//   "idleThresholdMinutes": 5     // gap in minutes to classify as idle-time regression
// }

import { loadSupiConfig } from "@mrclrchtr/supi-core/api";

export interface CacheMonitorConfig {
  /** Enable/disable cache monitoring. Default: true */
  enabled: boolean;
  /** Show regression warning notifications. Default: true */
  notifications: boolean;
  /** Percentage-point drop that triggers a regression warning. Default: 25 */
  regressionThreshold: number;
  /** Gap in minutes between turns to classify as idle-time regression. Default: 5 */
  idleThresholdMinutes: number;
}

export const CACHE_MONITOR_DEFAULTS: CacheMonitorConfig = {
  enabled: true,
  notifications: true,
  regressionThreshold: 25,
  idleThresholdMinutes: 5,
};

export function loadCacheMonitorConfig(cwd: string, homeDir?: string): CacheMonitorConfig {
  // Read the new section first, then fall back to the old section for upgrades.
  const merged = loadSupiConfig("supi-cache", cwd, CACHE_MONITOR_DEFAULTS, { homeDir });
  const legacy = loadSupiConfig("cache-monitor", cwd, CACHE_MONITOR_DEFAULTS, { homeDir });
  // Prefer new-section values when present; keep defaults as the base.
  return { ...CACHE_MONITOR_DEFAULTS, ...legacy, ...merged };
}
