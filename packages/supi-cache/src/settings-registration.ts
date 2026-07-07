// Cache-monitor settings registration for the supi settings registry.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerDeclarativeSettings } from "@mrclrchtr/supi-core/settings";
import { CACHE_MONITOR_DEFAULTS } from "./config.ts";

const THRESHOLD_VALUES = ["5", "10", "15", "20", "25", "30", "35", "40", "45", "50"];
const IDLE_THRESHOLD_VALUES = ["1", "2", "3", "5", "10", "15", "20", "30", "45", "60"];

/** Register supi-cache settings with the supi settings registry. */
export function registerCacheMonitorSettings(pi: ExtensionAPI, homeDir?: string): void {
  registerDeclarativeSettings(pi, {
    id: "cache",
    label: "Cache",
    section: "cache",
    defaults: CACHE_MONITOR_DEFAULTS,
    fields: [
      {
        kind: "boolean" as const,
        key: "enabled",
        label: "Enabled",
        description: "Enable/disable prompt cache health monitoring",
      },
      {
        kind: "boolean" as const,
        key: "notifications",
        label: "Notifications",
        description: "Show warning notifications on cache regressions",
      },
      {
        kind: "number" as const,
        key: "regressionThreshold",
        label: "Regression Threshold",
        description: "Percentage-point drop that triggers a regression warning",
        values: THRESHOLD_VALUES,
      },
      {
        kind: "number" as const,
        key: "idleThresholdMinutes",
        label: "Idle Threshold",
        description: "Minutes of inactivity to classify as idle-time regression",
        values: IDLE_THRESHOLD_VALUES,
      },
    ],
    ...(homeDir ? { homeDir } : {}),
  });
}
