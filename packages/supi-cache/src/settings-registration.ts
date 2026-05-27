// Cache-monitor settings registration for the supi settings registry.

import { registerConfigSettings } from "@mrclrchtr/supi-core/config";
import { CACHE_MONITOR_DEFAULTS } from "./config.ts";

const THRESHOLD_VALUES = ["5", "10", "15", "20", "25", "30", "35", "40", "45", "50"];
const IDLE_THRESHOLD_VALUES = ["1", "2", "3", "5", "10", "15", "20", "30", "45", "60"];

/** Register supi-cache settings with the supi settings registry. */
export function registerCacheMonitorSettings(homeDir?: string): void {
  registerConfigSettings({
    id: "supi-cache",
    label: "Cache",
    section: "supi-cache",
    defaults: CACHE_MONITOR_DEFAULTS,
    buildItems: (settings) => [
      {
        id: "enabled",
        label: "Enabled",
        description: "Enable/disable prompt cache health monitoring",
        currentValue: settings.enabled ? "on" : "off",
        values: ["on", "off"],
        configType: "boolean" as const,
      },
      {
        id: "notifications",
        label: "Notifications",
        description: "Show warning notifications on cache regressions",
        currentValue: settings.notifications ? "on" : "off",
        values: ["on", "off"],
        configType: "boolean" as const,
      },
      {
        id: "regressionThreshold",
        label: "Regression Threshold",
        description: "Percentage-point drop that triggers a regression warning",
        currentValue: String(settings.regressionThreshold),
        values: THRESHOLD_VALUES,
        configType: "number" as const,
      },
      {
        id: "idleThresholdMinutes",
        label: "Idle Threshold",
        description: "Minutes of inactivity to classify as idle-time regression",
        currentValue: String(settings.idleThresholdMinutes),
        values: IDLE_THRESHOLD_VALUES,
        configType: "number" as const,
      },
    ],
    ...(homeDir ? { homeDir } : {}),
  });
}
