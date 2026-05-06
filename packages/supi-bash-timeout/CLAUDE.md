# supi-bash-timeout

Injects a default timeout on bash tool calls when the LLM omits one. Prevents hung commands (e.g., `find /`) from blocking the agent indefinitely.

## Commands

```bash
pnpm vitest run packages/supi-bash-timeout/
pnpm exec tsc --noEmit -p packages/supi-bash-timeout/tsconfig.json
pnpm exec biome check packages/supi-bash-timeout/
```

## Architecture

A single `tool_call` handler intercepting `bash` events:

1. Checks if the LLM already specified a `timeout` parameter — skips if set
2. Otherwise injects the configured default timeout (120s by default)
3. Timeout is configurable via `/supi-settings` (uses `registerConfigSettings` from `supi-core`)

## Key files

- `bash-timeout.ts` — extension entry point, `tool_call` handler
- `config.ts` — `loadBashTimeoutConfig()` with defaults
- `settings-registration.ts` — registers settings with `supi-core` registry

## Gotchas

- `pi.on("tool_call")` runs before the tool executes — it can mutate input parameters (e.g., inject a default timeout) or block the call, but cannot modify the result.
- Call `registerBashTimeoutSettings()` during the factory function, not in async handlers.
