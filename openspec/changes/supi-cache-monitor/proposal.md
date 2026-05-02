## Why

Pi exposes per-turn `cacheRead`/`cacheWrite`/`input` token counts in every assistant message and shows cumulative totals in the footer (`R12k W8k`), but there is no interpretation layer. Users have no live visibility into whether prompt caching is working, no alerts when it breaks, and no way to diagnose why a cache regression happened (compaction? model switch? system prompt change?).

## What Changes

- New `supi-cache-monitor` workspace package providing continuous prompt cache health monitoring
- Per-turn cache metric tracking via `message_end` events: `cacheRead`, `cacheWrite`, `input`, computed `hitRate`
- Live footer status line showing last-turn hit rate with trend arrow (`cache: 87% ↑`)
- Regression detection with automated cause diagnosis via `session_compact`, `model_select`, and `before_agent_start` (system prompt hash change) events
- Warning notifications on cache regressions with probable cause (`Cache regression: 87% → 12%. Likely cause: compaction`)
- `/supi-cache` command for on-demand per-turn history table with annotated events
- Session-persisted turn history via `pi.appendEntry()` with state reconstruction from `ctx.sessionManager.getBranch()` on session resume
- Settings via `registerConfigSettings`: enabled, notifications toggle, regression threshold (default 25pp)
- Wired into the `supi` meta-package

## Capabilities

### New Capabilities
- `cache-health-tracking`: Per-turn cache metric collection, regression detection with cause diagnosis, footer status line, warning notifications, and `/supi-cache` history command

### Modified Capabilities

## Impact

- New workspace package `packages/supi-cache-monitor/` with peer deps on `@mariozechner/pi-coding-agent` and `@mariozechner/pi-tui`
- `packages/supi/package.json` gains `@mrclrchtr/supi-cache-monitor` dependency
- `packages/supi/index.ts` wires the new extension
- Session files gain custom entries for per-turn cache records (backward-compatible — older sessions simply have no cache history)
- Always-on event listeners (`message_end`, `session_compact`, `model_select`, `before_agent_start`) with minimal overhead
