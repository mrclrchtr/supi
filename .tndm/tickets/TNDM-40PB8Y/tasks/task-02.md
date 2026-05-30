# Task 2: Replace the pager-based full preview with an in-app inspector

## Goal
Implement the in-app inspector UX for `v` with Overview as the default mode, Raw Prompt as an in-app toggle, scrolling for long content, and export as a debug fallback while preserving the parent preview's approve/cancel behavior.

## Files
- `packages/supi-review/src/ui/flow.ts`
- `packages/supi-review/src/ui/review-plan-inspector.ts`
- `packages/supi-review/__tests__/unit/review-plan-inspector.test.ts`

## Change
- Create `packages/supi-review/src/ui/review-plan-inspector.ts` for the stateful TUI component so `packages/supi-review/src/ui/flow.ts` stays focused and does not absorb another large UI surface.
- Model two levels of state in the inspector component:
  - screen: `summary` vs `inspector`
  - inspector mode: `overview` vs `raw`
- Keep `previewReviewPlan()` in `packages/supi-review/src/ui/flow.ts` as the entry point, but route `v` to the in-app inspector instead of spawning `less`.
- Support these behaviors:
  - Overview opens first
  - a documented key switches between Overview and Raw Prompt
  - `↑↓` and `j`/`k` scroll long content
  - `q` or `esc` from the inspector returns to the summary screen
  - `enter` or `y` approves only from the summary screen
  - `esc` or `n` cancels only from the summary screen
  - `e` exports the raw prompt to a temp file and surfaces the path as a debug fallback
- Remove the `spawn("less", ...)` primary path from `packages/supi-review/src/ui/flow.ts`.
- Keep the inspector read-only; do not add prompt editing.

## Verification
1. **RED** — run:
   - `RTK_DISABLED=1 pnpm vitest run packages/supi-review/__tests__/unit/review-plan-inspector.test.ts`
   - Expected result: the new inspector interaction tests fail before implementation.
2. **GREEN** — rerun the same command after implementing the inspector.
   - Expected result: inspector tests pass.
3. Run the focused unit coverage together:
   - `RTK_DISABLED=1 pnpm vitest run packages/supi-review/__tests__/unit/packet.test.ts packages/supi-review/__tests__/unit/review-plan-inspector.test.ts`
   - Expected result: both test files pass together.
4. Typecheck the package and tests:
   - `pnpm exec tsc -b packages/supi-review/tsconfig.json packages/supi-review/__tests__/tsconfig.json`
   - Expected result: no type errors.

## Test strategy
TDD required.

