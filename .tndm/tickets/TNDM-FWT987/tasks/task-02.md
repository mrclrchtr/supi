# Task 2: Update docs.ts — adapt to new client API surface

## Goal

Ensure `docs.ts` works with the rewritten `context7-client.ts`. The import (`getContext`, `searchLibrary`, `Context7Error`) and function signatures remain the same — only the underlying implementation changes.

## File

`packages/supi-web/src/docs.ts`

## Changes

1. Verify the import line `import { Context7Error, getContext, searchLibrary } from "./context7-client.ts"` still matches the new exports
2. Verify the `instanceof Context7Error` checks in `runSearch` and `runFetch` catch blocks still work (they will — `Context7Error` class is kept in the new client)
3. No other changes needed — the existing parameter validation and result formatting in `docs.ts` is unchanged

## Verification

- Run `pnpm vitest run packages/supi-web/__tests__/unit/docs.test.ts` — tests fail (RED, test mocks not updated yet)
- Run `pnpm exec tsc -b packages/supi-web/tsconfig.json` — typecheck passes
