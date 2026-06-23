# Task 5: Gate LspClient.request() and pullDiagnosticsForUri on readiness


## Goal
Gate `LspClient.request()` on readiness so all 8 semantic query methods (hover, definition, references, documentSymbols, workspaceSymbol, rename, codeActions, implementation) await server readiness before sending their LSP request.

**Also gate `pullDiagnosticsForUri()` in `client-refresh.ts`** — it calls `rpc.sendRequest("textDocument/diagnostic", ...)` directly, bypassing `request()`. Add `await client.getReady()` before the `sendRequest` call.

## Files
- `packages/supi-lsp/src/client/client.ts` — gate `request()`
- `packages/supi-lsp/src/client/client-refresh.ts` — gate `pullDiagnosticsForUri()`

## Changes

### 1. `client.ts` — `request()` gate
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

### 2. `client-refresh.ts` — `pullDiagnosticsForUri()` gate
Find the existing `pullDiagnosticsForUri()` function. Before the `client.rpc.sendRequest("textDocument/diagnostic", ...)` call (which uses the internal `rpc` directly), add:
```ts
await (client as LspClient).getReady();
```
Or refactor to use the public `getReady()` method if it's already exposed.

Since `getReady()` is public (Task 4), this works. If `getReady()` rejects, the existing try/catch in `pullDiagnosticsForUri` will handle it.

## Verification
- Run: `pnpm exec vitest run packages/supi-lsp/__tests__/unit/client-readiness.test.ts` — test case 9 (request returns null on ready reject) still passes.
- Run: `pnpm exec vitest run packages/supi-lsp/__tests__/unit/client-pull-diagnostics.test.ts` — existing pull diagnostics tests pass.
- All existing unit tests still pass: `pnpm exec vitest run packages/supi-lsp/__tests__/unit/`
- `pnpm exec tsc -b packages/supi-lsp/tsconfig.json` — compiles clean.
