# Implementation Plan

## Files changed

- `packages/supi-claude-md/src/config.ts` — config interface + defaults
- `packages/supi-claude-md/src/state.ts` — state type + helpers
- `packages/supi-claude-md/src/claude-md.ts` — extension entrypoint
- `packages/supi-claude-md/src/subdirectory.ts` — injection logic
- `packages/supi-claude-md/src/settings-registration.ts` — settings UI
- `packages/supi-claude-md/README.md` — docs
- `packages/supi-claude-md/__tests__/config.test.ts`
- `packages/supi-claude-md/__tests__/state.test.ts`
- `packages/supi-claude-md/__tests__/subdirectory.test.ts`
- `packages/supi-claude-md/__tests__/settings-registration.test.ts`
- `packages/supi-claude-md/__tests__/extension-lifecycle.test.ts`
- `packages/supi-claude-md/__tests__/extension-toolresult.test.ts`
- `packages/supi-claude-md/__tests__/extension-helpers.ts`

## Tasks

- [x] **Task 1**: Simplify `config.ts` — remove `rereadInterval` and `contextThreshold`
  - File: `packages/supi-claude-md/src/config.ts`
  - Remove `rereadInterval` and `contextThreshold` from `ClaudeMdConfig` interface
  - Remove them from `CLAUDE_MD_DEFAULTS`
  - Verification: `pnpm exec tsc --noEmit -p packages/supi-claude-md/tsconfig.json` (will fail until all tasks complete; final verification at end)

- [x] **Task 2**: Simplify `state.ts` — remove turn tracking, simplify `InjectedDir` → `Set<string>`
  - File: `packages/supi-claude-md/src/state.ts`
  - Remove `completedTurns` from `ClaudeMdState`
  - Change `injectedDirs` from `Map<string, InjectedDir>` to `Set<string>`
  - Remove `InjectedDir` interface
  - Update `createInitialState()` accordingly
  - Simplify `reconstructState()`: remove turn counting, extract dirs as `Set<string>`
  - Update `CONTEXT_TAG_REGEX` — no longer needs `turn` capture group (but keep for backward compat with older sessions; just ignore turn)
  - Verification: `pnpm exec tsc --noEmit -p packages/supi-claude-md/__tests__/tsconfig.json` (will fail until all tasks complete)

- [x] **Task 3**: Simplify `subdirectory.ts` — remove re-read logic
  - File: `packages/supi-claude-md/src/subdirectory.ts`
  - Remove `turn` parameter from `formatSubdirContext` — update `<extension-context>` tag to omit `turn`
  - Remove `contextThreshold`, `rereadInterval`, `contextUsage`, `currentTurn` from `InjectionCheckOptions`
  - Simplify `shouldInjectSubdir` to only check `injectedDirs.has(dir)` (first-time only)
  - Remove `ContextUsage` interface export (no longer needed externally)
  - Remove `InjectedDir` import (no longer exists)
  - Remove `InjectionCheckOptions` export (no longer needed by callers)
  - Verification: `pnpm exec tsc --noEmit -p packages/supi-claude-md/tsconfig.json`

- [x] **Task 4**: Simplify `claude-md.ts` — remove turn tracking, simplify injection gating
  - File: `packages/supi-claude-md/src/claude-md.ts`
  - Remove `turn_end` handler entirely
  - In `session_start`: remove `completedTurns` from reconstructed state assignment
  - In `tool_result` handler: remove `contextUsage` fetch from `_ctx.getContextUsage()`
  - Remove `turn` argument from `formatSubdirContext` call
  - Remove `completedTurns` from `collectStaleDirs` → rename/simplify to just filter never-injected dirs
  - Simplify `updateInjectedDirTracking` to work with `Set<string>` (just `.add(dir)`)
  - Remove `ContextUsage` type import from subdirectory
  - Remove `InjectionCheckOptions` import (no longer needed)
  - Remove unused imports (`SessionCompactEvent`, `InjectedDir`)
  - Verification: `pnpm exec tsc --noEmit -p packages/supi-claude-md/tsconfig.json`

- [x] **Task 5**: Simplify `settings-registration.ts` — remove rereadInterval and contextThreshold settings
  - File: `packages/supi-claude-md/src/settings-registration.ts`
  - Remove `rereadInterval` setting item from `buildClaudeMdSettingItems`
  - Remove `contextThreshold` setting item from `buildClaudeMdSettingItems`
  - Remove `THRESHOLD_VALUES` constant
  - Remove `rereadInterval` and `contextThreshold` cases from `handleSettingChange`
  - Update `loadValues` test expectation (settings count goes from 4 to 2)
  - Verification: `pnpm exec tsc --noEmit -p packages/supi-claude-md/tsconfig.json`

- [x] **Task 6**: Update tests — adapt all affected test files
  - Files: `__tests__/config.test.ts`, `__tests__/state.test.ts`, `__tests__/subdirectory.test.ts`, `__tests__/settings-registration.test.ts`, `__tests__/extension-lifecycle.test.ts`, `__tests__/extension-toolresult.test.ts`, `__tests__/extension-helpers.ts`
  - Remove `rereadInterval`/`contextThreshold` from `DEFAULT_CONFIG` in `extension-helpers.ts`
  - Update `config.test.ts`: remove `rereadInterval`/`contextThreshold` assertions
  - Update `state.test.ts`: remove `completedTurns` assertions, update `injectedDirs` checks to use `Set` API
  - Update `subdirectory.test.ts`: remove `rereadInterval`/`contextThreshold`/turn tests, simplify `shouldInjectSubdir` tests to just check Set membership, update `formatSubdirContext` tests to not check for `turn` attribute, remove `ContextUsage` tests
  - Update `settings-registration.test.ts`: change expected setting count from 4 to 2, remove `rereadInterval`/`contextThreshold` assertions
  - Update `extension-lifecycle.test.ts`: remove `turn_end` describe block, update `createInitialState` mock, update `shouldInjectSubdir` call assertions
  - Update `extension-toolresult.test.ts`: remove `contextUsage` from `makeCtx` calls, update `shouldInjectSubdir` assertions, update `formatSubdirContext` assertions to not include turn
  - Verification: `pnpm vitest run packages/supi-claude-md/`

- [x] **Task 7**: Update README.md — remove rereadInterval and contextThreshold docs
  - File: `packages/supi-claude-md/README.md`
  - Remove "Smart about when to refresh" section
  - Remove `rereadInterval` and `contextThreshold` from settings table
  - Simplify settings description
  - Verification: manual review of README.md

- [x] **Task 8**: Final verification — typecheck + tests + biome
  - Commands: `pnpm exec tsc --noEmit -p packages/supi-claude-md/tsconfig.json && pnpm exec tsc --noEmit -p packages/supi-claude-md/__tests__/tsconfig.json && pnpm vitest run packages/supi-claude-md/ && pnpm exec biome check packages/supi-claude-md/`
  - Verification: all commands pass with zero errors
