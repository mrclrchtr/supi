## Implementation Plan

### Summary

Extend `recoverWorkspaceChangesFromToolResult` to also trigger when the written/edited file is a source file matching an active language server's file extension (e.g., `.ts`, `.tsx`, `.js`, `.py`), not just sentinel files (`package.json`, `tsconfig.json`, `*.d.ts`, lockfiles).

### Approach

Add a lightweight `hasServerForExtension` method to `LspManager`. In `recoverWorkspaceChangesFromToolResult`, after the existing sentinel check, also check if the file's extension matches a configured server. If so, do a soft recovery (clear pull result IDs + `didChangeWatchedFiles` notification) — the same lightweight path already used for `.d.ts` files.

The sentinel scan/walk logic in `workspace-sentinels.ts` remains unchanged. The new check uses `getServerForFile(this.config, filePath)` which is already imported in `manager.ts`.

---

- [x] **Task 1**: Add `hasServerForExtension` to `LspManager`
  - File: `packages/supi-lsp/src/manager/manager.ts`
  - Add: `hasServerForExtension(filePath: string): boolean` — delegates to already-imported `getServerForFile(this.config, filePath) !== null`
  - Verification: `pnpm exec tsc --noEmit -p packages/supi-lsp/tsconfig.json`

- [x] **Task 2**: Update `recoverWorkspaceChangesFromToolResult` in `lsp.ts`
  - File: `packages/supi-lsp/src/lsp.ts`
  - Restructure: after the sentinel check (which stays unchanged), add a source-file check via `state.manager.hasServerForExtension(pathValue)`
  - If source file hit: do `softRecoverWorkspaceChanges(state, [fileEvent])` — same pattern as `.d.ts` path
  - Verification: `pnpm exec tsc --noEmit -p packages/supi-lsp/tsconfig.json`

- [x] **Task 3**: Update sentinel tests
  - File: `packages/supi-lsp/__tests__/workspace-sentinels.test.ts`
  - Add test: `isWorkspaceRecoveryTrigger` returns `false` for a plain `.ts` source file (documents current behavior boundary)
  - Verification: `pnpm exec vitest run packages/supi-lsp/__tests__/workspace-sentinels.test.ts`

- [x] **Task 4**: Update recovery integration tests
  - File: `packages/supi-lsp/__tests__/workspace-sentinel-recovery.test.ts`
  - Update `isWorkspaceRecoveryTrigger` mock to be path-aware (returns true only for sentinel paths)
  - Add `hasServerForExtension` to the mock manager
  - Add test: writing a `.ts` source file triggers soft recovery via the new manager check
  - Add test: writing an unknown extension (e.g., `.xyz`) does NOT trigger recovery
  - Verification: `pnpm exec vitest run packages/supi-lsp/__tests__/workspace-sentinel-recovery.test.ts`

- [x] **Task 5**: Full workspace verification
  - Run: `pnpm exec biome check packages/supi-lsp && pnpm exec vitest run packages/supi-lsp/ && pnpm exec tsc --noEmit -p packages/supi-lsp/tsconfig.json && pnpm exec tsc --noEmit -p packages/supi-lsp/__tests__/tsconfig.json`
  - Verification: all checks pass, no lint errors, no type errors
