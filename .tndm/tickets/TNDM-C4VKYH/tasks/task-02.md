# Task 2: GREEN: implement the structured review-item contract and host-side normalization

## Goal
Replace the old `priority`-based finding contract with the approved review-item shape, add a single host-side normalization layer, and wire all command/rendering paths to use normalized items and derived verdicts.

## Files
- `packages/supi-review/src/tool/schemas.ts`
- `packages/supi-review/src/types.ts`
- `packages/supi-review/src/review-result.ts`
- `packages/supi-review/src/tool/review-runner.ts`
- `packages/supi-review/src/review.ts`
- `packages/supi-review/src/ui/format-content.ts`
- `packages/supi-review/src/ui/renderer.ts`

## Changes
1. In `packages/supi-review/src/tool/schemas.ts`, replace the legacy finding schema with the new review-item schema:
   - `category`
   - `impact`
   - `effort`
   - `recommended_action`
   - `confidence_score`
   - `suggested_fix`
   - `verification_hint`
   - optional `code_location`
   Remove the legacy `priority` field from the submitted review item shape.
2. In `packages/supi-review/src/types.ts`, replace the old `ReviewFinding` / result typing with the new structured review-item types. Keep the top-level result shape small and pre-release clean; do not keep a backward-compatibility bridge for `priority`.
3. Add `packages/supi-review/src/review-result.ts` as the single source of truth for:
   - validating / normalizing submitted review items
   - deriving the binary verdict from `recommended_action`
   - sorting items by `recommended_action`, `impact`, `effort`, `confidence_score`
   - computing action/category summary counts for rendering and follow-up logic
4. Update `packages/supi-review/src/tool/review-runner.ts` so the submit tool and reviewer instructions reflect the new contract and no longer describe or rely on `priority`.
5. Update `packages/supi-review/src/review.ts` to normalize successful review output before rendering or follow-up injection.
   - Use normalized items to decide whether the patch has issues.
   - Keep the fixed follow-up options unchanged.
   - Remove legacy severity/contradiction branching from the hidden follow-up message.
6. Update `packages/supi-review/src/ui/format-content.ts` and `packages/supi-review/src/ui/renderer.ts` so visible output shows the richer triage fields and structured fix guidance.

## Verification
Re-run the RED tests from Task 1 and confirm they now pass, then run source/test typecheck:

```bash
RTK_DISABLED=1 pnpm vitest run \
  packages/supi-review/__tests__/unit/review-result.test.ts \
  packages/supi-review/__tests__/unit/review-command.test.ts \
  packages/supi-review/__tests__/unit/renderer.test.ts \
  packages/supi-review/__tests__/unit/runner.test.ts -v
pnpm exec tsc --noEmit -p packages/supi-review/tsconfig.json
pnpm exec tsc --noEmit -p packages/supi-review/__tests__/tsconfig.json
```

Expected result: targeted tests pass and both typecheck commands are clean.

## TDD status
GREEN task — make only the minimal implementation needed to satisfy the failing tests from Task 1, then refactor locally while staying green.
