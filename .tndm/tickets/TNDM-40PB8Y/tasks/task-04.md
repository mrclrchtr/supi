# Task 4: Run package verification and Pi smoke-test the new preview flow

## Goal
Prove the assembled change works end-to-end in `supi-review` and in the interactive Pi review flow.

## Files
- `packages/supi-review/src/target/packet.ts`
- `packages/supi-review/src/ui/flow.ts`
- `packages/supi-review/src/ui/review-plan-inspector.ts`
- `packages/supi-review/__tests__/unit/packet.test.ts`
- `packages/supi-review/__tests__/unit/review-plan-inspector.test.ts`
- `packages/supi-review/README.md`
- `packages/supi-review/CLAUDE.md`

## Change
- No new implementation work. Verify the completed change.

## Verification
1. Run the package tests:
   - `RTK_DISABLED=1 pnpm vitest run packages/supi-review/`
   - Expected result: all `supi-review` unit tests pass.
2. Typecheck package and tests:
   - `pnpm exec tsc -b packages/supi-review/tsconfig.json packages/supi-review/__tests__/tsconfig.json`
   - Expected result: no type errors.
3. Run Biome on the package:
   - `pnpm exec biome check packages/supi-review`
   - Expected result: no lint or formatting violations.
4. Manual smoke test in Pi from a repo with reviewable git changes:
   - run `/supi-review`
   - advance to the review-plan preview
   - press `v` and confirm the inspector opens in Overview mode
   - switch to Raw Prompt mode and confirm long content scrolls in-app
   - use `e` and confirm a temp-file path is shown for export
   - press `esc` or `q` and confirm you return to the summary preview instead of canceling the whole review
   - confirm no external `less` pager is launched
   - press `enter` from the summary preview and confirm the review still starts normally

## Test strategy
Verification-only final task.

