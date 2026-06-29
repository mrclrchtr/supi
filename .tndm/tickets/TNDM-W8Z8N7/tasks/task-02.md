# Task 2: Extend ServerConfig and ProjectServerInfo with readiness types


## Goal
Add `readinessTimeoutMs?: number` to `ServerConfig` and `ready: boolean` to `ProjectServerInfo`. The timeout defaults to 10s in code; the field is optional in config. `ready` reflects live readiness state from `LspClient.isReady`.

## Files
- `packages/supi-lsp/src/config/server-config.ts`

## Change

### 1. `ServerConfig` — add optional field:
```ts
export interface ServerConfig {
  // ...existing fields...
  /** Maximum time to wait for a single $/progress cycle, in ms. Default: 10_000. */
  readinessTimeoutMs?: number;
}
```

### 2. `ProjectServerInfo` — add field:
```ts
export interface ProjectServerInfo extends DetectedProjectServer {
  // ...existing fields...
  /** Whether the LSP server is currently not indexing and ready to serve queries. */
  ready: boolean;
}
```

## Verification
- `pnpm exec tsc -b packages/supi-lsp/tsconfig.json` — compiles clean.
- `pnpm exec tsc -b packages/supi-lsp/__tests__/tsconfig.json` — test compilation passes (tests that mock `ProjectServerInfo` may need updating, to be handled in a later task).

## Test-exempt
Type-only change. Manual verification via typecheck pass. Test updates for mock shapes that reference `ProjectServerInfo` will be caught by typecheck and handled in the integration task.
