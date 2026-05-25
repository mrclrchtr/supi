# Task 1: Create supi-settings package scaffold

## Goal
Create the new `packages/supi-settings/` package with standard layout matching `supi-bash-timeout` as template.

## Files to create
- `packages/supi-settings/package.json` — depends on + bundles `@mrclrchtr/supi-core`, `pi.extensions: ["./src/extension.ts"]`, standard exports/peerDeps/keywords
- `packages/supi-settings/tsconfig.json` — standard package tsconfig
- `packages/supi-settings/vitest.config.ts` — standard vitest config
- `packages/supi-settings/src/api.ts` — re-exports from `./extension.ts`
- `packages/supi-settings/src/index.ts` — same as api.ts
- `packages/supi-settings/__tests__/tsconfig.json` — test tsconfig

## Verification
- `pnpm install` succeeds
- `pnpm exec tsc -b packages/supi-settings/tsconfig.json packages/supi-settings/__tests__/tsconfig.json` passes
