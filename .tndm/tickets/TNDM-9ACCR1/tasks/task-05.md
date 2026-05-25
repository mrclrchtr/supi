# Task 5: Update root workspace pi.extensions

## Goal
Replace `supi-core` extension with `supi-settings` in the root workspace `pi.extensions` array.

## File to modify
- `package.json` (root): in `pi.extensions` array, replace:
  ```
  "./packages/supi-core/src/extension.ts",
  ```
  with:
  ```
  "./packages/supi-settings/src/extension.ts",
  ```

## Verification
- `package.json` has `./packages/supi-settings/src/extension.ts` in `pi.extensions`
- `package.json` does NOT have `./packages/supi-core/src/extension.ts` in `pi.extensions`
- `pnpm install` succeeds
