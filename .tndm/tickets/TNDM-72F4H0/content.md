## Problem

`supi-lsp`'s workspace recovery in `recoverWorkspaceChangesFromToolResult` only triggers for "sentinel" files (`package.json`, `tsconfig*.json`, lockfiles, `*.d.ts`). When the agent creates a new source file via the `write` tool (e.g. `packages/supi-web/src/temp-file.ts`), the TypeScript language server is never notified. Existing files that import the new file then show stale "Cannot find module" errors — even though the file exists.

## Root Cause

1. Agent `write`/`edit` tool results go through `recoverWorkspaceChangesFromToolResult` in `lsp.ts`
2. `isWorkspaceRecoveryTrigger(path, cwd)` calls `isWorkspaceSentinelPath` which only matches a hardcoded whitelist
3. Regular `.ts` source files are **not** in the whitelist
4. The language server never receives `didChangeWatchedFiles`, so it doesn't know the new file exists
5. Importing files keep stale diagnostics until `/reload` triggers full re-initialization

## Impact

- False-positive "Cannot find module" diagnostics on existing files
- Stale errors persist across agent turns
- Only `/reload` clears them (destructive to session state)
- Hit during normal extension development when new source files are created

## Reproduction

1. Start a pi session with a TypeScript project
2. Have an existing `.ts` file import `./new-file.ts`
3. Use the `write` tool to create `new-file.ts`
4. Observe: importing file still shows "Cannot find module './new-file.ts'" in diagnostics
5. `/reload` clears it

## Potential Approaches

| Approach | Description | Tradeoff |
|---|---|---|
| **A. Extension-aware triggers** | Match changed file extensions against active server file patterns (e.g. TypeScript server → `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.mts`, `.cts`) | Correct + targeted, but needs per-server pattern registry |
| **B. Broaden sentinel whitelist** | Add common source extensions to `isWorkspaceSentinelPath` | Simple, but could over-notify on bulk writes |
| **C. Client-side file watcher** | Rely on language server's own file watcher instead of manual `didChangeWatchedFiles` | Clean, but not all environments/OSs have reliable watchers |
| **D. Post-write diagnostics refresh** | After any `write`/`edit`, force a full `recover` action on affected directories | Heavyweight, but guaranteed correct |

## Recommended: Approach A

Extend `isWorkspaceRecoveryTrigger` to also return `true` when the changed file's extension matches any **active language server's registered interest**. This keeps the noise low (only relevant servers are notified) while covering the actual source files that matter.

Key files to touch:
- `packages/supi-lsp/src/workspace-sentinels.ts` — broaden `isWorkspaceSentinelPath` or add new matcher
- `packages/supi-lsp/src/lsp.ts` — `recoverWorkspaceChangesFromToolResult` logic
- `packages/supi-lsp/src/manager/manager.ts` — expose active server → file pattern mapping

## Related Code

```ts
// packages/supi-lsp/src/lsp.ts
function recoverWorkspaceChangesFromToolResult(...) {
  // ...
  if (!isWorkspaceRecoveryTrigger(pathValue, cwd)) {
    return false;  // ← THE BUG: new .ts files are ignored here
  }
  // ...
}
```

```ts
// packages/supi-lsp/src/workspace-sentinels.ts
function isWorkspaceSentinelPath(filePath: string, root: string): boolean {
  const name = path.basename(filePath);
  if (name === "package.json") return true;
  if (name === "jsconfig.json") return true;
  if (name === "tsconfig.json") return true;
  // ...
  // No .ts/.tsx/.js/etc. source files here
}
```