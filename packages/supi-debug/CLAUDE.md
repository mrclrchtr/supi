# supi-debug

Session-local debug event capture, querying, and reporting for SuPi extensions.

## Architecture

Registers three surfaces:

1. **`supi_debug` tool** — agent-callable tool for querying recent or persisted-session debug events with filters
2. **`/supi-debug` command** — user-facing command for browsing live or persisted-session debug events in the TUI
3. **Settings** — `/supi-settings` integration for enable/disable, agent access level (off/sanitized/raw), and max events

Uses `supi-core`'s shared debug registry (`configureDebugRegistry`, `getDebugEvents`, `getDebugSummary`) and `registerContextProvider` for the TUI context summary.

## Package layout

Stays flat per convention — no domain folders until responsibilities grow.

## Key files

| File | Role |
|------|------|
| `src/debug.ts` | Extension factory, settings, tool + command registration |
| `src/format.ts` | Event formatting + data serialization |
| `src/renderer.ts` | Custom message renderer for `supi-debug-report` type |
| `src/session-events.ts` | Session-JSONL persistence and historical event reading |
| `src/status-log.ts` | Optional load-status logging (`$SUPI_LOG_STATUS`) |
| `src/extension.ts` | Pi extension entry, re-exports `src/debug.ts` default |
| `__tests__/unit/` | Unit tests |
| `__tests__/helpers/` | Shared test utilities |
| `__tests__/fixtures/` | Shared test data, when added |

## Gotchas

- Agent access defaults to `sanitized`; raw data requires explicit opt-in via settings. Historical records are always sanitized.
- `operationId` is an optional top-level exact filter and display field. Retain it only when it has the validated Debug Operation ID form.
- A Debug Operation ID means explicit direct request ownership. It is not a security identity, distributed trace, raw Pi Tool-call identity, or time overlap.
- `applyDebugConfig()` must be called synchronously at extension load and on each `session_start` — config changes via settings also call `syncLiveDebugRegistry()` immediately.
- When debug is disabled, `clearDebugEvents()` is called to flush the buffer. Re-enabling starts fresh.
