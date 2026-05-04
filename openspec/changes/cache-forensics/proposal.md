## Why

The cache monitor warns "system prompt changed" but gives no cross-session context — users can't investigate patterns like "do my cache drops cluster after loading certain tools?", "does stepping away for an hour kill my cache?", or "which session had the worst cache performance this week?" The data is already persisted in session files; the analysis layer is missing.

## What Changes

- Rename package `supi-cache-monitor` → `supi-cache` and restructure internally into `monitor/`, `forensics/`, and `report/` subdirectories.
- Move `getActiveBranchEntries()` from `supi-insights` into `supi-core` as a reusable session utility. Cache-specific extraction (`extractCacheTurnEntries`, `extractToolCallWindows`) lives in the forensics module.
- Build a cross-session forensics engine that scans past session files, extracts cache turn records, and runs diagnostic queries: hotspot detection, cause breakdown, tool correlation, and idle-time detection.
- Register a `supi_cache_forensics` agent tool so the LLM can investigate cache regressions programmatically.
- Add a `/supi-cache-forensics` user command with a themed TUI report renderer.
- Rename existing `/supi-cache` command to `/supi-cache-history` (same functionality, new name).

## Capabilities

### New Capabilities
- `cache-session-forensics`: Cross-session cache investigation — scan past sessions, extract cache turn data, detect regression patterns (hotspots, cause breakdown, tool correlation, idle time), and surface structured findings via an agent-callable tool and a user-facing TUI command.

### Modified Capabilities
- `cache-health-tracking`: The `/supi-cache` command is renamed to `/supi-cache-history`. The extension package is renamed from `supi-cache-monitor` to `supi-cache` and restructured internally. A new `/supi-cache-forensics` command and `supi_cache_forensics` tool are added.

## Impact

- **Package rename**: `@mrclrchtr/supi-cache-monitor` → `@mrclrchtr/supi-cache`. Touches root `package.json`, `packages/supi/` meta-package wiring, and `pnpm-lock.yaml`.
- **New shared utility in supi-core**: `getActiveBranchEntries()` extracted from `supi-insights/src/parser.ts`. Cache-specific extraction functions live in `supi-cache/forensics/`.
- **New dependency**: `supi-cache` depends on `SessionManager` from `@mariozechner/pi-coding-agent` for listing historical sessions.
- **No breaking changes** to the runtime monitoring behavior — footer status, regression detection, and per-turn tracking are unchanged.
