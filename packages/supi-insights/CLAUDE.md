# CLAUDE.md

## Scope

`@mrclrchtr/supi-insights` is a PI extension that scans historical sessions, extracts metadata and LLM facets, and generates HTML reports.

## Package layout

Source stays flat per convention. Tests are organized into `__tests__/unit/`.

```
src/
├── api.ts            # Re-export surface
├── index.ts          # Package-root re-exports
├── extension.ts      # PI extension entrypoint
├── insights.ts       # Extension factory — registers /supi-insights and settings
├── aggregator.ts     # Pure data aggregation + multi-clauding detection
├── cache.ts          # Facet and metadata caching
├── extractor.ts      # LLM facet extraction via @earendil-works/pi-ai/complete()
├── generator.ts      # Parallel narrative insight generation (7 sections)
├── html.ts           # HTML report renderer with CSS bar charts
├── parser.ts         # JSONL parsing, transcript extraction, tool stat aggregation
├── scanner.ts        # Session discovery via SessionManager.listAll()
├── types.ts          # Shared TypeScript types
├── utils.ts          # Chart helpers, label mappings, text utilities
├── report.css        # HTML report styling
└── report.js         # HTML report interactivity
__tests__/
├── tsconfig.json
└── unit/
    ├── aggregator.test.ts
    └── utils.test.ts
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

- Uses `@earendil-works/pi-ai/complete()` directly with `ctx.modelRegistry.getApiKeyAndHeaders()` — no external SDK needed.
- Long transcripts should be chunked and summarized before facet extraction to stay within token limits.

## Settings

- Uses `registerConfigSettings()` from `supi-core` for scoped `/supi-settings` integration.
- Config section: `"insights"`, keys: `enabled` (boolean), `maxSessions` (number), `maxFacets` (number).

## Tests

- Unit tests live at `packages/supi-insights/__tests__/unit/`.
- Package test tsconfig lives at `packages/supi-insights/__tests__/tsconfig.json`.

## Commands

- Command surface is `/supi-insights`, not `/insights`.

```bash
pnpm vitest run packages/supi-insights/
pnpm exec tsc --noEmit -p packages/supi-insights/tsconfig.json
pnpm exec tsc --noEmit -p packages/supi-insights/__tests__/tsconfig.json
pnpm exec biome check packages/supi-insights/
```

