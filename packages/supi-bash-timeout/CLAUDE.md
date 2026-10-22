# supi-bash-timeout

Injects a default timeout on bash tool calls when the LLM omits one. Prevents hung commands (e.g., `find /`) from blocking the agent indefinitely.

## Architecture

A single `tool_call` handler intercepting `bash` events:

1. Checks if the LLM already specified a `timeout` parameter — skips if set
2. Otherwise injects the configured default timeout (120s by default)
3. Timeout is configurable via `/supi-settings` (uses `defineConfigSettings` and `registerSettings` from `supi-core`)

## Gotchas

- Call `registerBashTimeoutSettings()` during the factory function, not in async handlers.
