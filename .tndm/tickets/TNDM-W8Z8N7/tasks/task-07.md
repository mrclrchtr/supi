# Task 7: Remove the 5× retry loop from workspaceSymbol() and clean up readiness state on restart


## Goal
Remove the 5× retry loop from `LspManager.workspaceSymbol()` — the readiness gate in `LspClient.request()` now handles the timing gap that the retry loop was working around. Keep the warm-project path intact.

## File
- `packages/supi-lsp/src/manager/manager.ts`

## Change

### Remove the retry loop
In `workspaceSymbol()`, the current flow is:
```
collect → warm → [retry 5× with 50ms delays] → fallback
```

Change to:
```
collect → warm → fallback (return initial.results)
```

Delete `retryWorkspaceSymbolAfterWarmup` private method entirely.

### Update workerSymbol() body
```ts
async workspaceSymbol(query: string): Promise<(SymbolInformation | WorkspaceSymbol)[] | null> {
  const helper = await import("./manager-workspace-symbol.ts");
  const initial = await helper.collectWorkspaceSymbols(this.clients.values(), query);
  if (!initial.hasSupport) return null;
  if (initial.results.length > 0) return initial.results;

  const warmed = await this.warmWorkspaceSymbolProjectsUntilResult(
    helper.findWorkspaceSymbolWarmTargets,
    helper.getWorkspaceSymbolWarmPosition,
    helper.collectWorkspaceSymbols,
    query,
  );
  return warmed.results ?? initial.results;
}
```

### Also clear readiness on restart
In `performStart()` and `restartClient()`, alongside `clearWarmedWorkspaceSymbolProjects(...)`, the new client's readiness state is naturally fresh (it's a new `LspClient` instance). No explicit call needed, but verify the `clearWarmedWorkspaceSymbolProjects` pattern is followed.

## Verification
- Run: `pnpm exec vitest run packages/supi-lsp/__tests__/unit/manager-workspace-recovery.test.ts` — existing manager tests pass.
- `pnpm exec tsc -b packages/supi-lsp/tsconfig.json` — compiles clean.
- Check: no references to `retryWorkspaceSymbolAfterWarmup` remain in the codebase (`rg retryWorkspaceSymbolAfterWarmup` returns empty).

## Test-exempt
Behavioral change (removing dead code). Existing integration tests cover workspaceSymbol behavior. Manual verification via `rg` + typecheck + existing test pass is sufficient.

