## Implementation Plan

- [x] **Task 1**: Export `isLikelyStaleDiagnostic` from `packages/supi-lsp/src/diagnostics/stale-diagnostics.ts` and update its test
- [x] **Task 2**: Create `packages/supi-lsp/src/manager/manager-stale-resync.ts` with `forceResyncStaleModuleFiles()` function
- [x] **Task 3**: Wire the re-sync into `before_agent_start` in `packages/supi-lsp/src/lsp.ts`
- [x] **Task 4**: Run full verification (typecheck, lint, tests)
- [x] **Task 5**: Write dedicated tests for the new module