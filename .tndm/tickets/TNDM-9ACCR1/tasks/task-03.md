# Task 3: Library-ify supi-core: remove extension surface

## Goal
Remove the extension surface from `supi-core` so it becomes a pure library package.

## Files to modify
- `packages/supi-core/package.json`:
  - Remove the entire `"pi"` key (currently `"pi": { "extensions": ["./src/extension.ts"] }`)
  - Remove `"./extension": "./src/extension.ts"` from `exports` map
- `packages/supi-core/src/extension.ts`:
  - Delete the file (only 2 lines: `export { registerSettingsCommand as default } from "./settings/settings-command.ts";`)

## What stays the same
- `src/settings/settings-command.ts` — `registerSettingsCommand` is still exported via `./settings`
- `src/settings/settings-registry.ts` — unchanged
- All other exports and domain entry points — unchanged

## Verification
- `pnpm install` succeeds
- `pnpm exec tsc -b packages/supi-core/tsconfig.json packages/supi-core/__tests__/tsconfig.json` passes
- `pnpm vitest run packages/supi-core/` passes (all existing tests still green)
- `packages/supi-core/package.json` has no `"pi"` key
- `packages/supi-core/package.json` exports has no `"./extension"` entry
