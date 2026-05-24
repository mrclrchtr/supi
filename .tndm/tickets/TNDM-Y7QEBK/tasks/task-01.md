# Task 1: Create src/workspace-change.ts with shared workspace helpers

Extract four shared helper functions from `lsp.ts` into a new top-level module:

- `markWorkspaceChange(state: LspRuntimeState): void` — sets `lastWorkspaceChangeAt`, `staleSuspected`, clears fingerprints
- `softRecoverWorkspaceChanges(state: LspRuntimeState, changes: FileEvent[]): boolean` — clears pull result IDs, notifies manager, calls markWorkspaceChange
- `refreshWorkspaceSentinels(state: LspRuntimeState, cwd: string): boolean` — syncs sentinel snapshot via `syncWorkspaceSentinelSnapshot`, calls softRecoverWorkspaceChanges
- `shouldInvalidateTsconfigScopeCache(filePath: string): boolean` — checks `.json`/`.jsonc` extension

These are pure move — identical function text, just relocated. No test changes needed (helpers were private to lsp.ts).

**Order first** because `handlers/diagnostic-injection.ts` and `handlers/workspace-recovery.ts` both import from here.
