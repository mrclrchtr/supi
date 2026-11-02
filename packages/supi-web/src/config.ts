import { loadSupiConfig } from "@mrclrchtr/supi-core/config";

/** Configuration section owned by the Web extension. */
export const WEB_CONFIG_SECTION = "web";

/** Persisted key for the Web Search tool. */
export const WEB_SEARCH_ENABLED_KEY = "webSearchEnabled";

/** Persisted opt-in for external Firecrawl retrieval. */
export const FIRECRAWL_ENABLED_KEY = "firecrawlEnabled";

/** Web extension configuration. */
export interface WebConfig extends Record<string, unknown> {
  /** Enable the web_search tool. */
  webSearchEnabled: boolean;
  /** Allow explicitly selected Firecrawl fetches; ordinary calls still fetch directly. */
  firecrawlEnabled: boolean;
}

/** Default Web extension configuration. */
export const WEB_DEFAULTS: WebConfig = {
  webSearchEnabled: true,
  firecrawlEnabled: false,
};

/** Load the merged Web extension configuration. */
export function loadWebConfig(cwd: string, homeDir?: string): WebConfig {
  const raw = loadSupiConfig(WEB_CONFIG_SECTION, cwd, WEB_DEFAULTS, { homeDir });
  return {
    webSearchEnabled:
      typeof raw.webSearchEnabled === "boolean"
        ? raw.webSearchEnabled
        : WEB_DEFAULTS.webSearchEnabled,
    firecrawlEnabled:
      typeof raw.firecrawlEnabled === "boolean"
        ? raw.firecrawlEnabled
        : WEB_DEFAULTS.firecrawlEnabled,
  };
}
