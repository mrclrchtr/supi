# CLAUDE.md

This file provides guidance to Claude Code when working in `packages/supi-insights/`.

## Scope

`@mrclrchtr/supi-insights` is a PI extension that scans historical sessions, extracts metadata and LLM facets, and generates HTML reports.

## Architecture

```
src/
├── insights.ts       # Extension factory — registers /insights command and settings
├── scanner.ts        # Session discovery via SessionManager.listAll()
├── parser.ts         # JSONL parsing, transcript extraction, tool stat aggregation
├── extractor.ts      # LLM facet extraction via @mariozechner/pi-ai/complete()
├── aggregator.ts     # Pure data aggregation + multi-clauding detection
├── generator.ts      # Parallel narrative insight generation (7 sections)
├── html.ts           # HTML report renderer with CSS bar charts
├── cache.ts          # Facet and metadata caching
├── utils.ts          # Chart helpers, label mappings, text utilities
└── types.ts          # Shared TypeScript types
```

## Session file parsing

- PI session files are append-only trees. The active branch is the path from the **last entry** (current leaf) back to root via `parentId` — do not analyze every entry in the file.
- When parsing raw session files directly (bypassing `SessionManager`), call `migrateSessionEntries(entries)` after `parseSessionEntries()` to handle legacy v1/v2 files that lack `id`/`parentId`.
- `buildSessionContext()` is the PI-native way to resolve branch paths; use it when possible instead of manual tree walks.

## Caching

- Cache keys for session-derived data should include `sessionId + filePath hash + modified timestamp`.
- This prevents collisions across branched sessions (same `sessionId`, different files) and invalidates stale caches when a session file is resumed/appended to.
- Cached metadata without cached facets should still be re-parsable for facet extraction on later runs.

## LLM facet extraction

- Uses `@mariozechner/pi-ai/complete()` directly with `ctx.modelRegistry.getApiKeyAndHeaders()` — no external SDK needed.
- Long transcripts should be chunked and summarized before facet extraction to stay within token limits.

## Settings

- Uses `registerConfigSettings()` from `supi-core` for scoped `/supi-settings` integration.
- Config section: `"insights"`, keys: `enabled` (boolean), `maxSessions` (number), `maxFacets` (number).

## Validation

- `pnpm exec biome check packages/supi-insights && pnpm exec tsc --noEmit -p packages/supi-insights/tsconfig.json`
