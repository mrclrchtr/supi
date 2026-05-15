# Archive

## Verification Results

### Typecheck
- `tsc --noEmit -p packages/supi-lsp/tsconfig.json` — ✅ No errors
- `tsc --noEmit -p packages/supi-lsp/__tests__/tsconfig.json` — ✅ No errors

### Lint
- `biome check packages/supi-lsp/` — ✅ Clean, no errors

### Tests
- `vitest run packages/supi-lsp/` — ✅ 444 tests pass, 0 failures
- New test file `manager-stale-resync.test.ts` — ✅ 7 tests pass:
  - Returns false when no outstanding diagnostics
  - Returns false when no module-resolution errors
  - Does not call closeFile/ensureFileOpen when no stale diagnostics
  - Re-opens files with module-resolution errors
  - Processes multiple stale files
  - Ignores non-module-resolution diagnostics in same file
  - Handles refreshOpenDiagnostics failure gracefully

### Changes Made

1. **`packages/supi-lsp/src/diagnostics/stale-diagnostics.ts`** — exported `isLikelyStaleDiagnostic` predicate
2. **`packages/supi-lsp/src/manager/manager-stale-resync.ts`** (new) — `forceResyncStaleModuleFiles()`: scans outstanding diagnostics for module-resolution errors, does `closeFile` + `ensureFileOpen` for each affected file, then runs `refreshOpenDiagnostics` to settle fresh diagnostics
3. **`packages/supi-lsp/src/lsp.ts`** — calls `forceResyncStaleModuleFiles` in `before_agent_start` after the prune/refresh/prune cycle but before building the diagnostic context, so fresh results are captured
4. **`packages/supi-lsp/__tests__/manager-stale-resync.test.ts`** (new) — 7 tests covering stale detection, multiple files, mixed diagnostics, and error handling
