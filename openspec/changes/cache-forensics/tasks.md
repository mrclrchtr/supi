**Prerequisite:** The `cache-monitor-prompt-fingerprints` change must be implemented first — forensics depends on `PromptFingerprint` and `diffFingerprints` from that change.

## 1. Package restructure

- [ ] 1.1 Rename `packages/supi-cache-monitor/` → `packages/supi-cache/`, update `package.json` name to `@mrclrchtr/supi-cache`
- [ ] 1.2 Update root `package.json` `pi.extensions` and `packages/supi/` meta-package wiring (entrypoint, dependencies, manifest)
- [ ] 1.3 Run `pnpm install` to refresh lockfile
- [ ] 1.4 Create `src/monitor/`, `src/forensics/`, `src/report/` subdirectories
- [ ] 1.5 Move existing files: `cache-monitor.ts` → `monitor/monitor.ts`, `state.ts` → `monitor/state.ts`, `status.ts` → `monitor/status.ts`, `report.ts` → `report/history.ts`
- [ ] 1.6 Update all internal imports to use new paths
- [ ] 1.7 Move root-level files that stay (`config.ts`, `fingerprint.ts`, `hash.ts`, `settings-registration.ts`) unchanged
- [ ] 1.8 Update `__tests__/` to mirror new structure (`__tests__/monitor/`, `__tests__/forensics/`, `__tests__/report/`)
- [ ] 1.9 Fix all test imports to use new module paths

## 2. Shared session utilities (supi-core)

- [ ] 2.1 Create `packages/supi-core/src/session-utils.ts` with `getActiveBranchEntries()` (moved from `supi-insights/src/parser.ts`)
- [ ] 2.2 Export from `packages/supi-core/src/index.ts`
- [ ] 2.3 Update `supi-insights/src/parser.ts` to import `getActiveBranchEntries` from `@mrclrchtr/supi-core`, remove local copy
- [ ] 2.4 Add unit tests for `getActiveBranchEntries` in `supi-core/__tests__/`

## 3. Forensics engine

- [ ] 3.1 Create `src/forensics/types.ts`: `ForensicsFinding`, `CauseBreakdown`, `ToolCallShape`, `ParamShape`, `ForensicsOptions`
- [ ] 3.2 Create `src/forensics/redact.ts`: `computeToolCallShape()`, `stripHumanDetail()` — shape fingerprint computation and `_prefixed` field stripping
- [ ] 3.3 Create `src/forensics/queries.ts`: `findHotspots()`, `breakdownCauses()`, `correlateTools()`, `detectIdleRegressions()` — pure functions operating on `TurnRecord[]` + session context
- [ ] 3.4 Create `src/forensics/extract.ts`: `extractCacheTurnEntries()` (filters custom entries by `customType === "supi-cache-turn"`), `extractToolCallWindows()` (tool name + param shapes from message entries, aligned by timestamp)
- [ ] 3.5 Create `src/forensics/forensics.ts`: `runForensics()` — scan pipeline (listAll → filter by date → parse → extract turns → extract tool windows → run query)
- [ ] 3.6 Add unit tests in `__tests__/forensics/`: extraction, query logic, shape fingerprint computation, idle detection, redaction stripping

## 4. Agent tool

- [ ] 4.1 Register `supi_cache_forensics` tool in `src/monitor/monitor.ts` with parameters: `pattern` (hotspots|breakdown|correlate|idle), `since` (duration string, default "7d"), `minDrop` (number, optional), `maxSessions` (number, default 100)
- [ ] 4.2 Implement tool handler: parse params → `runForensics()` → strip human detail → return JSON
- [ ] 4.3 Add tool `promptGuidelines` describing when the agent should use this tool
- [ ] 4.4 Add integration test for each query pattern via the tool interface

## 5. User commands

- [ ] 5.1 Rename `/supi-cache` command to `/supi-cache-history` (same handler, new name)
- [ ] 5.2 Create `src/report/history.ts` → custom message type `supi-cache-history` + register renderer (same TUI table as before)
- [ ] 5.3 Register `/supi-cache-forensics` command in `src/monitor/monitor.ts` with optional `--pattern`, `--since`, `--tool` args
- [ ] 5.4 Create `src/report/forensics.ts` → custom message type `supi-cache-forensics-report` + themed TUI renderer (table for hotspots/breakdown, richer detail with files/commands)
- [ ] 5.5 Add integration tests for both commands

## 6. Settings

- [ ] 6.1 Add `idleThresholdMinutes` to config schema in `src/config.ts` (default: 5)
- [ ] 6.2 Update `src/settings-registration.ts` to register the new `idleThresholdMinutes` setting and rename the config section from `"cache-monitor"` to `"supi-cache"`
- [ ] 6.3 Update `src/config.ts` to use `"supi-cache"` as the config section name (was `"cache-monitor"`)
- [ ] 6.4 Add config tests for default and custom idle threshold values

## 7. Verification

- [ ] 7.1 Run `pnpm vitest run packages/supi-cache/ packages/supi-core/ packages/supi-insights/` — fix failures
- [ ] 7.2 Run `pnpm exec biome check packages/supi-cache packages/supi-core packages/supi-insights` — auto-fix
- [ ] 7.3 Run `pnpm exec tsc --noEmit -p packages/supi-cache/tsconfig.json && pnpm exec tsc --noEmit -p packages/supi-cache/__tests__/tsconfig.json` — typecheck
- [ ] 7.4 Run `pnpm exec tsc --noEmit -p packages/supi-core/tsconfig.json` — typecheck shared utils
- [ ] 7.5 Run `pnpm verify` — full workspace check
- [ ] 7.6 Manual smoke test: run pi, verify `/supi-cache-history` works, run `/supi-cache-forensics`, verify agent can call `supi_cache_forensics`
