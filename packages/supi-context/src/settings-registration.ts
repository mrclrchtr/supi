// supi-context settings registration for the supi settings registry.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { defineConfigSettings, registerSettings } from "@mrclrchtr/supi-core/settings";
import { CONTEXT_DEFAULTS } from "./config.ts";

/** Register supi-context settings with the supi settings registry. */
export function registerContextSettings(pi: ExtensionAPI, homeDir?: string): void {
  registerSettings(
    pi,
    defineConfigSettings({
      id: "context",
      label: "Context",
      section: "context",
      defaults: CONTEXT_DEFAULTS,
      fields: [
        {
          kind: "boolean" as const,
          key: "agentToolEnabled",
          label: "Agent Tool",
          description: "Enable context_report agent tool for context usage queries",
        },
      ],
      ...(homeDir ? { homeDir } : {}),
    }),
  );
}
