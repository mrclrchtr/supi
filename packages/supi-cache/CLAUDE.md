# CLAUDE.md

## Scope

`@mrclrchtr/supi-cache` is a real-time prompt cache health monitor plus a cross-session forensics engine. It tracks per-turn cache hit rates, detects regressions with root-cause diagnosis (compaction, model change, prompt change), and provides two user commands and an agent-callable tool.

## Commands

```bash
pnpm vitest run packages/supi-cache/
pnpm exec biome check packages/supi-cache
pnpm exec tsc --noEmit -p packages/supi-cache/tsconfig.json
pnpm exec tsc --noEmit -p packages/supi-cache/__tests__/tsconfig.json
```

## Architecture

```
src/
├── monitor/          Real-time, event-driven monitoring
│   ├── monitor.ts    Extension factory — event wiring, commands, tool registration
│   ├── state.ts      Per-turn TurnRecord store + regression detection + cause tracking
│   └── status.ts     Compact footer status line ("cache: 80% ↑")
├── forensics/        Cross-session, query-driven investigation
│   ├── forensics.ts  Engine: SessionManager.listAll → parse → extract → query
│   ├── extract.ts    Branch walking: cache turn extraction + timestamp-aligned tool windows
│   ├── queries.ts    Pure query functions: hotspots, breakdown, correlate, idle
│   ├── redact.ts     Shape fingerprint computation + human-detail stripping
│   └── types.ts      ForensicsFinding, CauseBreakdown, ToolCallShape, ParamShape
├── report/           TUI rendering for commands
│   ├── history.ts    /supi-cache-history — per-turn table with regression details
│   └── forensics.ts  /supi-cache-forensics — themed breakdown/hotspot/correlate/idle views
├── fingerprint.ts    Prompt component fingerprinting (context files, tools, skills, etc.)
├── config.ts         Shared config (supi-cache section, legacy fallback for cache-monitor)
├── settings-registration.ts  /supi-settings wiring
└── hash.ts           FNV-1a fast string hashing
```

## Commands and tools

| Surface  | Name | Purpose |
|----------|------|---------|
| Command  | `/supi-cache-history` | Per-turn cache metrics table for the current session |
| Command  | `/supi-cache-forensics` | Cross-session regression investigation with TUI report |
| Tool     | `supi_cache_forensics` | Agent-callable — returns structured JSON with shape fingerprints |

## Key gotchas

- Config section is `supi-cache` with a backwards-compatible fallback read from the old `cache-monitor` section.
- `idleThresholdMinutes` (default 5) classifies `unknown`-cause regressions as `idle` when the inter-turn gap exceeds the threshold.
- `regressionThreshold` (default 25) gates which unknown-cause drops become forensics findings — drops below this threshold are excluded from hotspots, breakdowns, and idle detection unless the turn has a persisted cause.
- Tool correlation windows align by turn timestamps, not by assistant message count, so no-usage assistant messages don't skew the window.
- The forensics engine strips `_prefixed` fields (`_pathsInvolved`, `_commandSummaries`) before returning to the agent — these are human-only details shown in the TUI renderer.
- `resolveTurnCause()` in `state.ts` handles note-to-cause fallback for legacy session records that only have `note` strings (e.g. `"⚠ compaction"`).
