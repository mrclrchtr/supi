import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { defineConfigSettings, registerSettings } from "@mrclrchtr/supi-core/settings";
import { ANTIGRAVITY_CONFIG_SECTION, ANTIGRAVITY_DEFAULTS } from "./config.ts";
import type { AntigravityRuntime } from "./runtime.ts";

/** Register the Antigravity setting with an awaited availability refresh. */
export function registerAntigravitySettings(
  pi: ExtensionAPI,
  runtime: AntigravityRuntime,
  homeDir?: string,
): void {
  const fixedSettings = defineConfigSettings({
    id: ANTIGRAVITY_CONFIG_SECTION,
    label: "Antigravity",
    section: ANTIGRAVITY_CONFIG_SECTION,
    defaults: ANTIGRAVITY_DEFAULTS,
    fields: [
      {
        kind: "boolean" as const,
        key: "agentToolEnabled",
        label: "Antigravity Run tool",
        description: "Enable antigravity_run and its availability checks.",
      },
    ],
    ...(homeDir ? { homeDir } : {}),
  });

  registerSettings(pi, {
    ...fixedSettings,
    apply: async (request) => {
      const result = await fixedSettings.apply(request);
      if (request.fieldKey === "agentToolEnabled") {
        await runtime.refresh(request.cwd, request.ctx ? { ui: request.ctx.ui } : undefined);
      }
      return result;
    },
  });
}
