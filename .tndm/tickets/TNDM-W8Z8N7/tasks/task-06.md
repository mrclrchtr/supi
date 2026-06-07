# Task 6: Thread LspClient.ready through to ProjectServerInfo.ready


## Goal
Pass `LspClient.ready` (public getter) through to `ProjectServerInfo.ready` so the public API surface (`SessionLspService.getProjectServers()`) reports live readiness state to UI consumers.

## Files
- `packages/supi-lsp/src/manager/manager-project-info.ts`

## Change

### In `buildProjectServerInfo()`
Use the public getter `input.client?.ready` (not the private field `_isReady`):

```ts
return {
  name: input.serverName,
  root: input.root,
  fileTypes: input.fileTypes,
  status,
  supportedActions: getSupportedLspServerActions(input.client?.serverCapabilities),
  openFiles: input.client?.openFiles.map(...) ?? [],
  ready: input.client?.ready ?? false,   // public getter, not private _isReady
};
```

## Unit test extension
Add to `packages/supi-lsp/__tests__/unit/manager-project-info.test.ts` (or create if it doesn't exist):
- Test: when client is running and `ready === true`, `ProjectServerInfo.ready` is `true`.
- Test: when client is running and `ready === false`, `ProjectServerInfo.ready` is `false`.
- Test: when client is `undefined`, `ready` defaults to `false`.

## Verification
- Run unit tests: `pnpm exec vitest run packages/supi-lsp/__tests__/unit/manager-project-info.test.ts`
- `pnpm exec tsc -b packages/supi-lsp/tsconfig.json packages/supi-lsp/__tests__/tsconfig.json` — compiles clean.

