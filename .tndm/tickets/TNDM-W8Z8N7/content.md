
## Approach

Implement **Server-Initiated Work Done Progress** (LSP 3.17). tsserver already sends `window/workDoneProgress/create` + `$/progress` — supi-lsp just doesn't listen. Gate all semantic queries at `LspClient.request()` through `await this.getReady()`. Expose `ready: boolean` on `ProjectServerInfo` for UI consumers in `supi-code-intelligence`.

## Readiness State Machine (multi-token, steady-state)

```
State: trackedTokens: Map<ProgressToken, "begin-seen" | "ended">
       _readyPromise: Promise<void> | null
       isReady: boolean

initialized sent
  │
  ├── no progress token within 2s ──→ resolve ready, isReady = true
  │
  └── token arrives (window/workDoneProgress/create)
       │
       ├── $/progress { kind: "begin" } → tokens.set(token, "begin-seen"), isReady = false
       │    └── start per-token timeout (config.readinessTimeoutMs, default 10s)
       │
       ├── $/progress { kind: "report" } → no-op (log for debug)
       │
       └── $/progress { kind: "end" } → tokens.set(token, "ended")
            └── all tokens ended? → resolve ready, isReady = true
            └── per-token timeout fires? → force end that token, re-check

New begin after isReady === true:
  → tokens.set(newToken, "begin-seen"), isReady = false, arm fresh _readyPromise

Client crash during waiting:
  → _readyPromise rejects, isReady stays false, tokens cleared
```

## Gate

```ts
private async request<T>(method: string, params: unknown): Promise<T | null> {
  if (!this.rpc || this._status !== "running") return null;
  try {
    await this.getReady();
    return (await this.rpc.sendRequest(method, params)) as T;
  } catch {
    return null;
  }
}
```

## Files Changed

| # | File | Change |
|---|------|--------|
| 1 | `config/capabilities.ts` | `window: { workDoneProgress: true }` |
| 2 | `config/server-config.ts` | `ServerConfig.readinessTimeoutMs?: number` (default 10s). `ProjectServerInfo.ready: boolean`. |
| 3 | `client/client.ts` | New: `getReady()`, `isReady`, `_readyPromise`, `trackedTokens` Map, `$/progress` notification dispatch, `window/workDoneProgress/create` token capture, per-token timeouts. Clear on `shutdown()`. |
| 4 | `client/client.ts` L496 | Gate `request()` with `await this.getReady()` |
| 5 | `client/client.ts` ~start() | After `initialized`, arm 2s no-progress grace timer |
| 6 | `client/client-refresh.ts` | Gate `pullDocumentDiagnostics()` with `await client.getReady()` |
| 7 | `manager/manager-project-info.ts` | Read `isReady` from `LspClient` → `ProjectServerInfo.ready` |
| 8 | `manager/manager.ts` ~workspaceSymbol() | Remove 5× retry loop. Keep warm-project path. |
| 9 | `manager/manager.ts` ~performStart() | Clear readiness state alongside `clearWarmedWorkspaceSymbolProjects` |

## Key Parameters

| Parameter | Value | Configurable? |
|-----------|-------|---------------|
| No-progress window | 2s | No (hardcoded) |
| Per-token timeout | 10s | Yes: `ServerConfig.readinessTimeoutMs` |

## Edge Cases

| Case | Behavior |
|------|----------|
| Server never sends progress | 2s after `initialized` → ready |
| Server sends `begin` but no `end` | Per-token timeout → force resolve |
| Multi-token (t1 begin → t2 begin → t1 end → t2 end) | Ready only after both end |
| New `begin` after `isReady === true` | `isReady` flips `false`, fresh promise armed |
| Client crashes during waiting | `_readyPromise` rejects, `isReady` stays `false` |
| `/reload` kills old client | `shutdown()` clears all state |
| Shutdown while `ready` pending | Pending `_readyPromise` rejects |

## What stays

- Warm-project path in `workspaceSymbol()` — preserved. Its calls now await readiness.
- `window/workDoneProgress/cancel` — explicitly not implemented as we never send it.
- `workspaceSymbol()` returns `[]` if no servers support it (unchanged).
