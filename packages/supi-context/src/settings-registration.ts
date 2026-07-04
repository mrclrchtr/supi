// supi-context settings registration for the supi settings registry.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerConfigSettings } from "@mrclrchtr/supi-core/config";
import { CONTEXT_DEFAULTS } from "./config.ts";

/** Register supi-context settings with the supi settings registry. */
export function registerContextSettings(pi: ExtensionAPI, homeDir?: string): void {
  registerConfigSettings(pi, {
    id: "context",
    label: "Context",
    section: "context",
    defaults: CONTEXT_DEFAULTS,
    buildItems: (settings) => [
      {
        id: "agentToolEnabled",
        label: "Agent Tool",
        description: "Enable supi_context agent tool for context usage queries",
        currentValue: settings.agentToolEnabled ? "on" : "off",
        values: ["on", "off"],
        configType: "boolean" as const,
      },
    ],
    ...(homeDir ? { homeDir } : {}),
  });
}
