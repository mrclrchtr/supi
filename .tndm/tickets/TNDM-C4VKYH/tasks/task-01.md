# Task 1: RED: codify the new review-item contract, derived verdict, and triage-driven follow-up

## Goal
Write failing tests that lock the approved contract change before implementation. The new expectations should cover structured review items, host-derived verdict behavior, fixed follow-up options driven by `recommended_action`, and visible rendering of the richer triage fields.

## Files
- `packages/supi-review/__tests__/unit/review-result.test.ts`
- `packages/supi-review/__tests__/unit/review-command.test.ts`
- `packages/supi-review/__tests__/unit/renderer.test.ts`
- `packages/supi-review/__tests__/unit/runner.test.ts`

## Changes
1. Add a new unit test file for the future normalization helper at `packages/supi-review/__tests__/unit/review-result.test.ts`.
   - Assert verdict derivation from `recommended_action` (`must-fix` => `PATCH HAS ISSUES`, otherwise `PATCH IS CORRECT`).
   - Assert sorting order by `recommended_action`, `impact`, `effort`, then `confidence_score`.
   - Assert summary counts by action/category are computed from normalized items.
2. Rewrite `packages/supi-review/__tests__/unit/review-command.test.ts` expectations to use the new review-item shape instead of `priority`.
   - Keep the fixed follow-up options (`Fix all`, `Fix selected`, `Verify findings`, `Skip`).
   - Drive urgency from normalized `recommended_action`, not contradiction heuristics or legacy severity branches.
3. Update `packages/supi-review/__tests__/unit/renderer.test.ts` so visible output expectations include category, recommended action, impact/effort, suggested fix, and verification hint.
4. Update `packages/supi-review/__tests__/unit/runner.test.ts` to expect the reviewer tool contract/schema to reference structured review items with fix guidance and no legacy `priority` field.

## Verification
Run the new/updated tests and confirm they fail for the expected reason (missing new contract / normalization behavior), not for unrelated syntax mistakes:

```bash
RTK_DISABLED=1 pnpm vitest run \
  packages/supi-review/__tests__/unit/review-result.test.ts \
  packages/supi-review/__tests__/unit/review-command.test.ts \
  packages/supi-review/__tests__/unit/renderer.test.ts \
  packages/supi-review/__tests__/unit/runner.test.ts -v
```

Expected result: failures that point to the absent review-item contract / derived-verdict behavior.

## TDD status
TDD task — watch the tests fail before writing implementation code.
