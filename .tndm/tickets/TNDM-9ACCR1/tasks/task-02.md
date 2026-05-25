# Task 2: Write supi-settings extension + test

## Goal
Implement the extension entrypoint and write a unit test verifying it registers `/supi-settings`.

## Files to create/modify
- `packages/supi-settings/src/extension.ts` — default export: imports `registerSettingsCommand` from `@mrclrchtr/supi-core/settings`, calls it with `pi`
- `packages/supi-settings/__tests__/unit/extension.test.ts` — TDD: verify that when the extension factory runs, `pi.registerCommand` is called with `"supi-settings"` and a handler

## Test approach (TDD)
1. Write failing test first: mock `pi` with `createPiMock()`, capture `registerCommand` calls, assert `"supi-settings"` is registered
2. Implement `src/extension.ts`
3. Run test — must pass

## Verification
- `pnpm vitest run packages/supi-settings/` passes
- `pnpm exec tsc -b packages/supi-settings/tsconfig.json packages/supi-settings/__tests__/tsconfig.json` passes
