# Task 4: Implement readiness state machine in LspClient (TDD — GREEN)


## Goal
Implement the readiness state machine in `LspClient` to make the 11 failing tests from Task 3 pass (GREEN).

## File
- `packages/supi-lsp/src/client/client.ts`

## Changes

### Type imports (add at top, import from vscode-languageserver-protocol)
Do NOT redeclare types inline. Import from the protocol package:

```ts
import type { ProgressToken, WorkDoneProgressBegin, WorkDoneProgressReport, WorkDoneProgressEnd } from "vscode-languageserver-protocol";
type WorkDoneProgressValue = WorkDoneProgressBegin | WorkDoneProgressReport | WorkDoneProgressEnd;
```

### New private fields (use `_isReady` to distinguish from public `ready` getter)
```ts
private trackedTokens = new Map<ProgressToken, "begin-seen" | "ended">();
private _readyPromise: Promise<void> | null = null;
private _readyResolve: (() => void) | undefined;
private _readyReject: ((err: Error) => void) | undefined;
private _isReady = false;
private noProgressTimer: ReturnType<typeof setTimeout> | null = null;
private tokenTimeouts = new Map<ProgressToken, ReturnType<typeof setTimeout>>();
```

### Public getter
```ts
get ready(): boolean {
  return this._isReady;
}
```

### `getReady()` method (public, usable by external callers like client-refresh.ts)
Returns immediately if `_isReady`. Returns existing `_readyPromise` if one is pending. Creates and returns a new one otherwise. The promise stores resolve/reject in `_readyResolve`/`_readyReject`.

### `handleProgress()` method
Dispatches on `value.kind`:
- `"begin"`: Cancel the 2s no-progress timer (covers servers that send `begin` without preceding `create`). Track token, set `_isReady = false`, arm `_readyPromise`, start per-token timeout.
- `"end"`: Mark token ended, clear per-token timeout, call `checkAllTokensEnded()`.
- `"report"`: no-op.

### `checkAllTokensEnded()` method
If all tracked tokens are `"ended"`, clears the map, resolves `_readyPromise`, sets `_isReady = true`.

### `resolveReady()` helper
Resolves the current `_readyPromise` (if any) and sets `_isReady = true`. Used by the no-progress timer and `checkAllTokensEnded()`.

### `rejectReady(reason: Error)` helper
Rejects pending `_readyPromise`, clears it, sets `_isReady = false`.

### `startTokenTimeout()` / `clearTokenTimeout()` methods
Per-token timeout using `this.config.readinessTimeoutMs ?? 10_000`. On fire, force-end the token and call `checkAllTokensEnded()`.

### `cancelNoProgressTimer()` helper
Clears and nulls out `this.noProgressTimer`. Called from `handleProgress("begin")` and `handleServerRequest("window/workDoneProgress/create")`.

### Notification handler extension (in `start()`)
Extend the existing `this.rpc.onNotification(...)` to also handle `$/progress` → calls `this.handleProgress()`.

### Server request handler update
Replace the no-op `case "window/workDoneProgress/create"`:
```ts
case "window/workDoneProgress/create": {
  const token = (params as { token: ProgressToken }).token;
  this.trackedTokens.set(token, "begin-seen");
  this.cancelNoProgressTimer();
  return null;
}
```

### No-progress timer (in `start()`, after `initialized` notification)
```ts
this.noProgressTimer = setTimeout(() => {
  if (this.trackedTokens.size === 0) this.resolveReady();
  this.noProgressTimer = null;
}, 2_000);
```

### Shutdown cleanup (extend existing `shutdown()`)
Clear `noProgressTimer`, clear all `tokenTimeouts`, clear `trackedTokens`, call `rejectReady(new Error("Client shutdown"))`.

### Process exit cleanup (extend existing `process.on("exit", ...)`)
When `_status` becomes `"error"`: same readiness cleanup as shutdown, using `rejectReady(new Error("Client crashed"))`.

## Verification (GREEN phase)
- Run: `pnpm exec vitest run packages/supi-lsp/__tests__/unit/client-readiness.test.ts`
- All 11 tests pass.
- All existing tests still pass: `pnpm exec vitest run packages/supi-lsp/__tests__/unit/`
- `pnpm exec tsc -b packages/supi-lsp/tsconfig.json packages/supi-lsp/__tests__/tsconfig.json` — compiles clean.

