# supi-debug

Session-local debug event capture, querying, and reporting for SuPi extensions.

## Commands

```bash
pnpm vitest run packages/supi-debug/
pnpm exec tsc --noEmit -p packages/supi-debug/tsconfig.json
pnpm exec biome check packages/supi-debug/
```

## Architecture

Registers three surfaces:

1. **`supi_debug` tool** — agent-callable tool for querying recent debug events with source/level/category filters
2. **`/supi-debug` command** — user-facing command for browsing debug events in the TUI
3. **Settings** — `/supi-settings` integration for enable/disable, agent access level (off/sanitized/raw), max events, notify level

Uses `supi-core`'s shared debug registry (`configureDebugRegistry`, `getDebugEvents`, `getDebugSummary`) and `registerContextProvider` for the TUI context summary.

## Key files

- `debug.ts` — extension factory, settings, tool + command registration
- `format.ts` — event formatting + data serialization
- `renderer.ts` — custom message renderer for `supi-debug-report` type

## Gotchas

- Agent access defaults to `sanitized`; raw data requires explicit opt-in via settings. The tool returns a clear message when raw access is denied.
- `applyDebugConfig()` must be called synchronously at extension load and on each `session_start` — config changes via settings also call `syncLiveDebugRegistry()` immediately.
- When debug is disabled, `clearDebugEvents()` is called to flush the buffer. Re-enabling starts fresh.
