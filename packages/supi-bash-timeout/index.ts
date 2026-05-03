// Bash Timeout — inject default timeouts on bash tool calls.
//
// The pi bash tool accepts an optional `timeout` parameter, but the LLM
// doesn't always specify one.  In a headless gateway daemon with no human
// watching, a single hung command (e.g. `find /` over a huge filesystem)
// blocks all subsequent messages indefinitely.
//
// This extension intercepts every bash `tool_call` event and sets a default
// timeout when the LLM omits one.  The timeout is configurable via
// /supi-settings or the SuPi config system (default 120s).

import { type ExtensionAPI, isToolCallEventType } from "@mariozechner/pi-coding-agent";
import { loadBashTimeoutConfig } from "./config.ts";
import { registerBashTimeoutSettings } from "./settings-registration.ts";

export default function bashTimeout(pi: ExtensionAPI) {
  registerBashTimeoutSettings();

  pi.on("tool_call", async (event, ctx) => {
    if (!isToolCallEventType("bash", event)) return;

    // Only inject when the LLM didn't specify a timeout
    if (event.input.timeout !== undefined && event.input.timeout !== null) return;

    const config = loadBashTimeoutConfig(ctx.cwd);
    event.input.timeout = config.defaultTimeout;
  });
}
