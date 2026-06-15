# Task 4: Final verification: package checks and full repo verify

## Goal
Prove the assembled change works end-to-end at the package level and does not break the repo verification gate.

## Files
- no new file edits; verification only

## Change
Run the complete verification sequence after tasks 1-3 are green.

## Verification
Run these commands in order:
1. `RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/ -v`
2. `pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json packages/supi-code-intelligence/__tests__/tsconfig.json`
3. `pnpm exec biome check packages/supi-code-intelligence`
4. `pnpm verify:ai`

Expected result: all commands exit zero.
