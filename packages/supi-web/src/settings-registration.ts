import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  defineConfigSettings,
  registerSettings,
  type SettingsModule,
} from "@mrclrchtr/supi-core/settings";
import {
  FIRECRAWL_ENABLED_KEY,
  loadWebConfig,
  WEB_CONFIG_SECTION,
  WEB_DEFAULTS,
  WEB_SEARCH_ENABLED_KEY,
} from "./config.ts";
import { isBxAvailable } from "./tool/web_search/bx.ts";

const RELOAD_NOTICE = "Web Search setting saved. Run /reload to apply this change.";

/** Contribute Web settings; Firecrawl applies per call, Web Search requires reload. */
export function registerWebSettings(pi: ExtensionAPI, homeDir?: string): void {
  const fixedSettings = defineConfigSettings({
    id: WEB_CONFIG_SECTION,
    label: "Web",
    section: WEB_CONFIG_SECTION,
    defaults: WEB_DEFAULTS,
    fields: [
      {
        kind: "boolean" as const,
        key: WEB_SEARCH_ENABLED_KEY,
        label: "Web Search tool",
        description: "Enable the web_search tool when bx is available on PATH",
      },
      {
        kind: "boolean" as const,
        key: FIRECRAWL_ENABLED_KEY,
        label: "Firecrawl",
        description:
          "Allow agent-selected Firecrawl retrieval using FIRECRAWL_API_KEY; shares public URLs and may consume credits. Ordinary fetches stay direct.",
      },
    ],
    ...(homeDir ? { homeDir } : {}),
  });

  const settings: SettingsModule = {
    ...fixedSettings,
    apply: async (request) => {
      const result = await fixedSettings.apply(request);
      if (request.fieldKey === FIRECRAWL_ENABLED_KEY) {
        const missingKey =
          loadWebConfig(request.cwd, homeDir).firecrawlEnabled &&
          !process.env.FIRECRAWL_API_KEY?.trim();
        return {
          ...result,
          notice: {
            message: missingKey
              ? "Firecrawl preference saved, but FIRECRAWL_API_KEY is missing. Export it before starting Pi to use Firecrawl."
              : "Firecrawl setting saved. Applies to subsequent fetch calls; ordinary fetches stay direct.",
            level: missingKey ? "warning" : "info",
          },
        };
      }
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
