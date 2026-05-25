# Task 6: Update pack-staged test assertions

## Goal
Update `scripts/__tests__/pack-staged.test.mjs` to reflect changed `pi.extensions` arrays.

## Changes
- For each of the 13 packages that lost the bundled extension: update `expectExplicitSurface` assertions. Each now has fewer entries.
- Add assertion for new `supi-settings` package: `expectExplicitSurface` should expect `["./src/extension.ts"]`.

## Approach
Read the current test file to find all `expectExplicitSurface` calls for affected packages. Match the expected arrays to the new `pi.extensions` content exactly.

## Verification
- `node scripts/pack-staged.mjs packages/supi-settings --dry-run` succeeds
- `pnpm pack:check` passes for all packages (spot-check 3-4 affected packages)
- The test file assertions match the actual package.json contents
