# Archive

## Verification Results

### All checks pass ✅

- **Biome**: 84 files checked, no issues
- **Tests**: 437 tests passed (0 failures) — full `packages/supi-lsp/` suite
- **Typecheck (main)**: `tsc --noEmit -p packages/supi-lsp/tsconfig.json` — no errors
- **Typecheck (tests)**: `tsc --noEmit -p packages/supi-lsp/__tests__/tsconfig.json` — no errors

### Changes made

| File | Change |
|------|--------|
| `packages/supi-lsp/src/manager/manager.ts` | Added `hasServerForExtension(filePath)` — delegates to `getServerForFile(this.config, filePath) !== null` |
| `packages/supi-lsp/src/lsp.ts` | Restructured `recoverWorkspaceChangesFromToolResult` to also check source file extensions after sentinel check; if matched, triggers lightweight soft recovery (clear pull IDs + `didChangeWatchedFiles`) |
| `packages/supi-lsp/__tests__/workspace-sentinels.test.ts` | Added test: plain `.ts`/`.tsx`/`.js` files return `false` from `isWorkspaceRecoveryTrigger` |
| `packages/supi-lsp/__tests__/workspace-sentinel-recovery.test.ts` | Made `isWorkspaceRecoveryTrigger` mock path-aware; added `hasServerForExtension` to mock manager; added tests for source file recovery and unknown-extension non-recovery |

### Design decisions

- **Lightweight recovery for source files**: Same pattern as `.d.ts` — just `clearAllPullResultIds()` + `notifyWorkspaceFileChanges([fileEvent])`. No full sentinel snapshot sync, since source files aren't tracked in the sentinel snapshot.
- **Sentinel path unchanged**: `isWorkspaceSentinelPath` / `isWorkspaceRecoveryTrigger` in `workspace-sentinels.ts` remains exactly the same. The new source-file check is a separate path in `recoverWorkspaceChangesFromToolResult`.
- **No false positives on unknown extensions**: Files with extensions not matching any configured server's `fileTypes` (e.g., `.xyz`, `.md`) are correctly ignored.
