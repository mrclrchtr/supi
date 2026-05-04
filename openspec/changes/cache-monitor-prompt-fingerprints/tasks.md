## 1. Fingerprint core

- [x] 1.1 Create `fingerprint.ts` with `PromptFingerprint` type and `computePromptFingerprint(opts?)` function
- [x] 1.2 Create `fingerprint.test.ts` with unit tests for fingerprint computation, stability, and zero-value handling
- [x] 1.3 Create `diffFingerprints(prev, curr)` function in `fingerprint.ts` with per-component change detection
- [x] 1.4 Add unit tests for `diffFingerprints` covering added/modified/removed context files and skills, tool/guideline/custom/append changes, and identical fingerprints

## 2. State integration

- [x] 2.1 Add `lastPromptFingerprint?: PromptFingerprint` to `CacheMonitorState` and `promptFingerprint?: PromptFingerprint` to `TurnRecord`
- [x] 2.2 Update `recordTurn` to attach `lastPromptFingerprint` to the turn record
- [x] 2.3 Update `restoreFromEntries` and `reset` to handle the new field (no special logic needed beyond existing spread)
- [x] 2.4 Update `state.test.ts` to assert fingerprints are attached and survive across turns

## 3. Event wiring

- [x] 3.1 Update `before_agent_start` handler in `cache-monitor.ts` to compute and store the fingerprint via `state.updatePromptFingerprint(...)` (add new state method)
- [x] 3.2 Update `detectRegression` / `formatRegressionMessage` to diff fingerprints and append the diff list when cause is `prompt_change`
- [x] 3.3 Update `index.test.ts` integration tests to verify enriched prompt-change notifications contain diff text

## 4. Report enrichment

- [x] 4.1 Add regression-details rendering logic to `report.ts` that iterates turns with regression causes and prints turn index, hit-rate drop, and fingerprint diff bullets
- [x] 4.2 Update `report.test.ts` to verify the detail section appears below the history table for prompt-change regressions

## 5. Verification

- [x] 5.1 Run `pnpm vitest run packages/supi-cache-monitor/` and fix failures
- [x] 5.2 Run `pnpm exec biome check packages/supi-cache-monitor` and auto-fix
- [x] 5.3 Run `chezmoi status|diff|apply -n` (if relevant) or general repo lint to ensure no regressions
