// Cache-forensics settings registration.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { defineConfigSettings, registerSettings } from "@mrclrchtr/supi-core/settings";
import { CACHE_FORENSICS_DEFAULTS } from "./config.ts";

const THRESHOLD_VALUES = ["5", "10", "15", "20", "25", "30", "35", "40", "45", "50"];
const IDLE_THRESHOLD_VALUES = ["1", "2", "3", "5", "10", "15", "20", "30", "45", "60"];

/** Register thresholds used by historical cache forensics. */
export function registerCacheForensicsSettings(pi: ExtensionAPI, homeDir?: string): void {
  registerSettings(
    pi,
    defineConfigSettings({
      id: "cache",
      label: "Cache Forensics",
      section: "cache",
      defaults: CACHE_FORENSICS_DEFAULTS,
      fields: [
        {
          kind: "number" as const,
          key: "regressionThreshold",
          label: "Regression Threshold",
          description: "Percentage-point drop included as an unknown-cause finding",
          values: THRESHOLD_VALUES,
        },
        {
          kind: "number" as const,
          key: "idleThresholdMinutes",
          label: "Idle Threshold",
          description: "Minutes between requests used to classify a finding as idle",
          values: IDLE_THRESHOLD_VALUES,
        },
      ],
      ...(homeDir ? { homeDir } : {}),
    }),
  );
}
