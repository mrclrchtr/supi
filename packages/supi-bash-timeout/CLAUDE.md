# supi-bash-timeout

## Architecture

In `tool_call`, inject the configured default only when `bash` has no explicit `timeout`; preserve caller values.

## Gotchas

- Call `registerBashTimeoutSettings()` during the factory function, not in async handlers.
