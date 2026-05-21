# Task 3: Run targeted packaging verification for the meta-package fix

## Goal
Verify the fix with both the new regression coverage and the existing packaging pipeline.

## Files
- `scripts/__tests__/pack-staged.test.mjs`
- `scripts/pack-staged.mjs`

## Verification steps
1. Run the full `scripts/__tests__/pack-staged.test.mjs` file.
2. Run `node scripts/publish.mjs packages/supi` and confirm it packs and verifies successfully.

## Expected result
- The new dependency-resolution regression stays green.
- Existing packaging checks for `packages/supi` continue to pass.
