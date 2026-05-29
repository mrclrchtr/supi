# Task 6: Full package verification and manual review smoke test

## Goal
Verify the complete `supi-review` redesign end-to-end after all implementation and docs tasks are finished.

## Files
- `packages/supi-review/`

## Changes
1. Run the full package test suite.
2. Run source and test typecheck.
3. Run Biome across the package.
4. Perform a manual smoke review on a small diff and confirm the visible/hidden review flow matches the approved redesign.

## Verification
Run:

```bash
RTK_DISABLED=1 pnpm vitest run packages/supi-review/ -v
pnpm exec tsc --noEmit -p packages/supi-review/tsconfig.json
pnpm exec tsc --noEmit -p packages/supi-review/__tests__/tsconfig.json
pnpm exec biome check packages/supi-review
```

Manual smoke test:
- run `/supi-review` on a small, reviewable diff
- confirm the rendered output shows category, impact, effort, recommended action, suggested fix, and verification hint for each review item
- confirm the top-level verdict matches the normalized items
- confirm the follow-up step still offers exactly `Fix all`, `Fix selected`, `Verify findings`, `Skip`

Expected result: all automated checks pass and the manual smoke flow matches the approved design end-to-end.

## TDD status
Verification-only final gate. No new code should be written in this task.
