// Cache-monitor settings registration for the supi settings registry.

import type { ConfigSettingsHelpers } from "@mrclrchtr/supi-core";
import { registerConfigSettings } from "@mrclrchtr/supi-core";
import { CACHE_MONITOR_DEFAULTS } from "./config.ts";

const THRESHOLD_VALUES = ["5", "10", "15", "20", "25", "30", "35", "40", "45", "50"];

/** Register cache-monitor settings with the supi settings registry. */
export function registerCacheMonitorSettings(homeDir?: string): void {
  registerConfigSettings({
    id: "cache-monitor",
    label: "Cache Monitor",
    section: "cache-monitor",
    defaults: CACHE_MONITOR_DEFAULTS,
    buildItems: (settings) => [
      {
        id: "enabled",
        label: "Enabled",
        description: "Enable/disable prompt cache health monitoring",
        currentValue: settings.enabled ? "on" : "off",
        values: ["on", "off"],
      },
      {
        id: "notifications",
        label: "Notifications",
        description: "Show warning notifications on cache regressions",
        currentValue: settings.notifications ? "on" : "off",
        values: ["on", "off"],
      },
      {
        id: "regressionThreshold",
        label: "Regression Threshold",
        description: "Percentage-point drop that triggers a regression warning",
        currentValue: String(settings.regressionThreshold),
        values: THRESHOLD_VALUES,
      },
    ],
    // biome-ignore lint/complexity/useMaxParams: ConfigSettingsOptions interface callback
    persistChange: (_scope, _cwd, settingId, value, helpers) => {
      handleSettingChange(settingId, value, helpers);
    },
    ...(homeDir ? { homeDir } : {}),
  });
}

function handleSettingChange(
  settingId: string,
  value: string,
  helpers: ConfigSettingsHelpers,
): void {
  switch (settingId) {
    case "enabled": {
      helpers.set("enabled", value === "on");
      break;
    }
    case "notifications": {
      helpers.set("notifications", value === "on");
      break;
    }
    case "regressionThreshold": {
      const num = Number.parseInt(value, 10);
      helpers.set("regressionThreshold", Number.isNaN(num) ? 25 : num);
      break;
    }
  }
}
