import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  defineConfigSettings,
  registerSettings,
  type SettingsModule,
} from "@mrclrchtr/supi-core/settings";
import {
  loadWebConfig,
  WEB_CONFIG_SECTION,
  WEB_DEFAULTS,
  WEB_SEARCH_ENABLED_KEY,
} from "./config.ts";
import { isBxAvailable } from "./tool/web_search/bx.ts";

const RELOAD_NOTICE = "Web Search setting saved. Run /reload to apply this change.";

/** Register the Web Search setting without changing active tools. */
export function registerWebSettings(pi: ExtensionAPI, homeDir?: string): void {
  const fixedSettings = defineConfigSettings({
    id: WEB_CONFIG_SECTION,
    label: "Web Search",
    section: WEB_CONFIG_SECTION,
    defaults: WEB_DEFAULTS,
    fields: [
      {
        kind: "boolean" as const,
        key: WEB_SEARCH_ENABLED_KEY,
        label: "Web Search tool",
        description: "Enable the web_search tool when bx is available on PATH",
      },
    ],
    ...(homeDir ? { homeDir } : {}),
  });

  const settings: SettingsModule = {
    ...fixedSettings,
    apply: async (request) => {
      const result = await fixedSettings.apply(request);
      if (
        request.fieldKey === WEB_SEARCH_ENABLED_KEY &&
        loadWebConfig(request.cwd, homeDir).webSearchEnabled &&
        !isBxAvailable()
      ) {
        return {
          notice: {
            message: `${RELOAD_NOTICE} bx is not available on PATH, so web_search will stay unavailable until bx is available.`,
            level: "warning",
          },
        };
      }

      return {
        ...result,
        notice: {
          message: RELOAD_NOTICE,
          level: "info",
        },
      };
    },
  };

  registerSettings(pi, settings);
}
