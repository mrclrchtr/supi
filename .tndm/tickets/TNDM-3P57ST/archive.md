# Archive

## Verification Results

### Fresh verification (all passing)

- **TypeScript (source):** `pnpm exec tsc --noEmit -p packages/supi-claude-md/tsconfig.json` → no errors
- **TypeScript (tests):** `pnpm exec tsc --noEmit -p packages/supi-claude-md/__tests__/tsconfig.json` → no errors
- **Tests:** `pnpm vitest run packages/supi-claude-md/` → 63/63 passed
- **Biome:** `pnpm exec biome check packages/supi-claude-md/` → no issues

### Git diff summary

15 files changed, 68 insertions, 430 deletions — net removal of 362 lines across source, tests, and docs.

### Changes made

| File | Change |
|------|--------|
| `src/config.ts` | Removed `rereadInterval` and `contextThreshold` from interface + defaults |
| `src/state.ts` | Removed `completedTurns`, `InjectedDir`; changed `injectedDirs` from `Map<string, InjectedDir>` to `Set<string>` |
| `src/subdirectory.ts` | Simplified `shouldInjectSubdir` to single Set membership check; removed `turn` from `formatSubdirContext`; removed `ContextUsage`, `InjectionCheckOptions` |
| `src/claude-md.ts` | Removed `turn_end` handler; removed `contextUsage` fetch; simplified injection pipeline to first-time-only |
| `src/settings-registration.ts` | Removed `rereadInterval` and `contextThreshold` setting items + `THRESHOLD_VALUES` |
| `README.md`, `CLAUDE.md` | Updated docs to reflect once-per-session injection |
| 7 test files | Updated mocks, removed stale tests, simplified assertions |

### Design intent preserved

- First-time injection still always occurs (even under context pressure) ✅
- Compaction still clears `injectedDirs` for re-discovery ✅
- Native-path dedup still works ✅
- Discovery and formatting logic unchanged ✅
- Turn tracking, re-read gating, and context-threshold checks removed ✅

