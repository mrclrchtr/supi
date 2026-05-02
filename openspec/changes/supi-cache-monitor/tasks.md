## 1. Package Scaffolding

- [x] 1.1 Create `packages/supi-cache-monitor/` directory with `package.json` (workspace package, peer deps on `@mariozechner/pi-coding-agent` and `@mariozechner/pi-tui`, dependency on `@mrclrchtr/supi-core`)
- [x] 1.2 Create `tsconfig.json` and `__tests__/tsconfig.json` following existing supi package patterns
- [x] 1.3 Run `pnpm install` to link the workspace package

## 2. Config & Settings

- [x] 2.1 Create `config.ts` with `CacheMonitorConfig` type and defaults (`enabled: true`, `notifications: true`, `regressionThreshold: 25`)
- [x] 2.2 Create `settings-registration.ts` using `registerConfigSettings` from supi-core with `enabled`, `notifications`, and `regressionThreshold` settings
- [x] 2.3 Write tests for config defaults and settings registration

## 3. State Management

- [x] 3.1 Create `state.ts` with `TurnRecord` type (`turnIndex`, `cacheRead`, `cacheWrite`, `input`, `hitRate` (number | undefined), `timestamp`) and `CacheMonitorState` class holding the turn history array and cause-tracking flags
- [x] 3.2 Implement `recordTurn(usage, timestamp)` method that computes `hitRate` (guarding for `cacheRead + input === 0` → `undefined`) and appends a turn record
- [x] 3.3 Implement cause-tracking methods: `flagCompaction()`, `flagModelChange(modelInfo)`, `updatePromptHash(hash)` that set timestamped flags consumed by regression detection
- [x] 3.4 Implement `detectRegression()` method that compares current vs previous turn hit rate against the threshold (skipping turns with `undefined` hitRate) and returns the diagnosed cause (compaction, model change, prompt change, unknown, or null if no regression)
- [x] 3.5 Implement `restoreFromEntries(entries: SessionEntry[])` to reconstruct state from persisted session entries (filter `type === "custom"` and `customType === "supi-cache-turn"` from `ctx.sessionManager.getBranch()`)
- [x] 3.6 Implement `cacheSupported` flag logic: set to `true` when any turn reports non-zero `cacheRead` or `cacheWrite`
- [x] 3.7 Write tests for hit rate computation (including division-by-zero guard), regression detection, cause diagnosis, state restoration, and missing-usage skipping

## 4. Status Line Formatting

- [x] 4.1 Create `status.ts` with `formatCacheStatus(state)` function returning the compact footer string (`cache: 87% ↑`, `cache: 0%`, `cache: —`)
- [x] 4.2 Implement trend arrow logic: `↑` when hit rate increased, `↓` when decreased, omitted when unchanged or first turn
- [x] 4.3 Implement `cache: —` fallback when `cacheSupported` is false or current turn has `undefined` hitRate
- [x] 4.4 Write tests for all status line formatting variants

## 5. Report Formatting

- [x] 5.1 Create `report.ts` with `formatCacheReport(state, theme)` function returning themed lines for the `/supi-cache` history table
- [x] 5.2 Implement table columns: Turn, Input, CacheR, CacheW, Hit%, Note
- [x] 5.3 Implement Note column annotations: `cold start`, `⚠ compaction`, `⚠ model changed`, `⚠ prompt changed`, `⚠ unknown`
- [x] 5.4 Implement empty-state message: `No cache data yet — send a message to start tracking`
- [x] 5.5 Write tests for report formatting with various turn histories

## 6. Extension Wiring

- [x] 6.1 Create `index.ts` extension factory wiring `message_end` → filter to `role === "assistant"` with defined `usage`, then state.recordTurn + persist + update status + check regression
- [x] 6.2 Wire `session_compact` → state.flagCompaction
- [x] 6.3 Wire `model_select` → state.flagModelChange
- [x] 6.4 Wire `before_agent_start` → compute fast non-crypto hash of full `event.systemPrompt`, state.updatePromptHash
- [x] 6.5 Wire `session_start` → state.restoreFromEntries (via `ctx.sessionManager.getBranch()`) + clear status if disabled
- [x] 6.6 Wire `session_shutdown` → clear in-memory state and status to avoid stale data on session switch
- [x] 6.7 Register `/supi-cache` command that renders the report via `pi.sendMessage` with custom type
- [x] 6.8 Register message renderer for `supi-cache-report` custom type
- [x] 6.9 Call `registerCacheMonitorSettings()` in the factory function
- [x] 6.10 Respect `enabled` setting: skip all event processing and clear status when off
- [x] 6.11 Respect `notifications` setting: suppress `ctx.ui.notify` when off, keep status line
- [x] 6.12 Write integration tests for the extension factory with mocked pi API

## 7. Meta-Package Integration

- [x] 7.1 Create `packages/supi/cache-monitor.ts` re-export entrypoint
- [x] 7.2 Add `@mrclrchtr/supi-cache-monitor` to `packages/supi/package.json` dependencies
- [x] 7.3 Add `./cache-monitor.ts` to `packages/supi/package.json` `pi.extensions` array
- [x] 7.4 Run `pnpm install` to update lockfile

## 8. Verification

- [x] 8.1 Run `pnpm exec biome check packages/supi-cache-monitor/` and fix any issues
- [x] 8.2 Run `pnpm exec tsc --noEmit -p packages/supi-cache-monitor/tsconfig.json` and fix type errors
- [x] 8.3 Run `pnpm vitest run packages/supi-cache-monitor/` and ensure all tests pass
- [x] 8.4 Run `pnpm verify` for full workspace validation
