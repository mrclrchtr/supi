# supi-debug

Session-local debug event capture, querying, and reporting for SuPi extensions.

## Ownership

Producers publish events through `supi-core`'s shared debug registry. This extension owns retention and agent-access policy, sanitized session persistence, and human reporting. Its context provider supplies the TUI context summary.

## Gotchas

- Agent access defaults to `sanitized`; raw data requires explicit opt-in via settings. Historical records are always sanitized.
- `operationId` is an optional top-level exact filter and display field. Retain it only when it has the validated Debug Operation ID form.
- A Debug Operation ID means explicit direct request ownership. It is not a security identity, distributed trace, raw Pi Tool-call identity, or time overlap.
- `applyDebugConfig()` must be called synchronously at extension load and on each `session_start` — config changes via settings also call `syncLiveDebugRegistry()` immediately.
- When debug is disabled, `clearDebugEvents()` is called to flush the buffer. Re-enabling starts fresh.
