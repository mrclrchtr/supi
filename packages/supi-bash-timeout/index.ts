// Bash Timeout — inject default timeouts on bash tool calls.
//
// The pi bash tool accepts an optional `timeout` parameter, but the LLM
// doesn't always specify one.  In a headless gateway daemon with no human
// watching, a single hung command (e.g. `find /` over a huge filesystem)
// blocks all subsequent messages indefinitely.
//
// This extension intercepts every bash `tool_call` event and sets a default
// timeout when the LLM omits one.  The timeout is configurable via the
// PI_BASH_DEFAULT_TIMEOUT env var (seconds, default 120).
//
// ADR-0049: Gateway TUI via WebSocket

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const DEFAULT_TIMEOUT_SECONDS = 120;

function getDefaultTimeout(): number {
  const env = process.env.PI_BASH_DEFAULT_TIMEOUT;
  if (env) {
    const parsed = parseInt(env, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_TIMEOUT_SECONDS;
}

export default function bashTimeout(pi: ExtensionAPI) {
  pi.on("tool_call", async (event) => {
    if (event.toolName !== "bash") return;

    const input = event.input as { command?: string; timeout?: number };

    // Only inject when the LLM didn't specify a timeout
    if (input.timeout !== undefined && input.timeout !== null) return;

    const defaultTimeout = getDefaultTimeout();
    input.timeout = defaultTimeout;
  });
}
