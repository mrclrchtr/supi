// Configuration for supi-cache-monitor.
//
// Config shape (in supi shared config, "cache-monitor" section):
// {
//   "enabled": true,             // enable/disable cache monitoring
//   "notifications": true,       // show regression warning notifications
//   "regressionThreshold": 25    // percentage-point drop that triggers a warning
// }

import { loadSupiConfig } from "@mrclrchtr/supi-core";

export interface CacheMonitorConfig {
  /** Enable/disable cache monitoring. Default: true */
  enabled: boolean;
  /** Show regression warning notifications. Default: true */
  notifications: boolean;
  /** Percentage-point drop that triggers a regression warning. Default: 25 */
  regressionThreshold: number;
}

export const CACHE_MONITOR_DEFAULTS: CacheMonitorConfig = {
  enabled: true,
  notifications: true,
  regressionThreshold: 25,
};

export function loadCacheMonitorConfig(cwd: string, homeDir?: string): CacheMonitorConfig {
  return loadSupiConfig("cache-monitor", cwd, CACHE_MONITOR_DEFAULTS, { homeDir });
}
