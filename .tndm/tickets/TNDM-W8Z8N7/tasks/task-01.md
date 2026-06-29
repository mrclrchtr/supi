# Task 1: Add window.workDoneProgress to CLIENT_CAPABILITIES


## Goal
Tell tsserver we can receive work-done-progress notifications by adding `window: { workDoneProgress: true }` to the client capabilities sent during the `initialize` handshake.

## File
- `packages/supi-lsp/src/config/capabilities.ts`

## Change
Add a `window` block to `CLIENT_CAPABILITIES` alongside the existing `textDocument` and `workspace` blocks:

```ts
window: {
  workDoneProgress: true,
},
```

## Verification
- `pnpm exec tsc -b packages/supi-lsp/tsconfig.json` — compiles clean.
- Existing integration tests still pass: `pnpm exec vitest run packages/supi-lsp/__tests__/integration/client.integration.test.ts`
- The `initialize` request now includes `window.workDoneProgress` in its capabilities payload (can be verified by inspecting tsserver logs or adding a temporary debug log).

## Test-exempt
Config-only change with no logic. Manual verification via typecheck + integration test pass is sufficient.
