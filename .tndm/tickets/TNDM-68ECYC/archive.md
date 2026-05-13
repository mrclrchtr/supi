# Archive

## Verification Evidence

### Test results (fresh run)
- **Test suites**: 47 passed, 47 total
- **Tests**: 141 passed, 141 total
- **Coverage**: tab-spinner (10 tests) + execute.test.ts (11 tests) + full regression of both packages

### TypeScript typecheck (fresh run)
- `packages/supi-extras/tsconfig.json` — No errors
- `packages/supi-ask-user/tsconfig.json` — No errors
- `packages/supi-ask-user/__tests__/tsconfig.json` — No errors

### What was verified
1. ✅ ask-user emits `supi:ask-user:start` before overlay and `supi:ask-user:end` after overlay closes (start before end order)
2. ✅ tab-spinner pauses on `supi:ask-user:start` (no new spinner titles during 200ms pause window)
3. ✅ tab-spinner resumes on `supi:ask-user:end` (spinner continues from stored frame)
4. ✅ Unbalanced `supi:working:end` does not stop spinner while agent is active (decrement floor of 1)
5. ✅ All existing tests still pass (no regressions)

### Files changed
- `packages/supi-ask-user/src/ask-user.ts` — +2 lines (event emits)
- `packages/supi-ask-user/__tests__/execute.test.ts` — +25 lines (event emission test)
- `packages/supi-extras/src/tab-spinner.ts` — +24 lines (pause/resume, hasActiveAgent guard)
- `packages/supi-extras/__tests__/tab-spinner.test.ts` — +48 lines, -1 line (pause/resume test, unbalanced guard test, removed stale comment)
