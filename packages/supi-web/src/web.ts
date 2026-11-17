/** SuPi Web extension entry point for fetch and optional Web Search. */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { loadWebConfig } from "./config.ts";
import { registerWebSettings } from "./settings-registration.ts";
import { registerWebFetchMdTool } from "./tool/web_fetch_md/register.ts";
import { hasBxApiKey, isBxAvailable } from "./tool/web_search/bx.ts";
import { registerWebSearchTool } from "./tool/web_search/register.ts";

/** Register web tools and evaluate Web Search at the session load boundary. */
export default function webExtension(pi: ExtensionAPI): void {
  registerWebSettings(pi);
  registerWebFetchMdTool(pi);

  let webSearchRegistered = false;
  pi.on("session_start", async (_event, ctx) => {
    if (webSearchRegistered) return;

    const config = loadWebConfig(ctx.cwd);
    if (!config.webSearchEnabled) return;

    if (!isBxAvailable()) {
      ctx.ui.notify(
        "Web Search is enabled, but bx is not available on PATH. web_search is unavailable until bx is available.",
        "warning",
      );
      return;
    }

    registerWebSearchTool(pi);
    webSearchRegistered = true;

    // Stay registered without a key: bx rereads its config per call, so a later
    // `bx config set-key` takes effect without /reload.
    if ((await hasBxApiKey(ctx.cwd)) === false) {
      ctx.ui.notify(
        "Web Search is enabled, but bx has no Brave API key. Run `bx config set-key` or set BRAVE_SEARCH_API_KEY in the environment that starts Pi.",
        "warning",
      );
    }
  });
}
