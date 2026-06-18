# Task 1: Redesign external schema and normalization contract

## Goal
Replace the old model-facing `ask_user` form contract with the approved hard-cut schema and normalized question model.

## Files
- `packages/supi-ask-user/__tests__/unit/normalize.test.ts`
- `packages/supi-ask-user/src/schema.ts`
- `packages/supi-ask-user/src/types.ts`
- `packages/supi-ask-user/src/normalize.ts`
- `packages/supi-ask-user/src/api.ts`
- `packages/supi-ask-user/src/index.ts`

## TDD steps
1. RED: Rewrite `normalize.test.ts` first and run:
   ```bash
   RTK_DISABLED=1 pnpm vitest run packages/supi-ask-user/__tests__/unit/normalize.test.ts -v
   ```
   Expected red result: failures show the current schema still accepts or emits old fields and does not implement the new recommendation/default rules.
2. GREEN: Update schema, normalized question types, normalization, and public exports until the same command passes.

## Required test coverage
- Valid mixed form has no `required`, `initial`, `allowOther`, or `allowPartialSubmit` fields.
- Top-level `allowPartialSubmit` is rejected with an `AskUserValidationError`.
- Question-level deprecated fields `required`, `initial`, and `allowOther` are rejected with `AskUserValidationError`.
- Single-select choice accepts `recommendation: string`; if absent, `recommendedIndexes` defaults to `[0]`.
- Multi-select choice accepts `recommendation: string[]`; if absent, `recommendedIndexes` defaults to `[]`.
- Invalid recommendation shapes are rejected: array on single-select and string on multi-select.
- Text questions accept trimmed `recommendation?: string`; blank text recommendations are omitted.

## Implementation notes
- `AskUserParamsSchema` must remove deprecated fields and add `recommendation?: string` to text questions.
- `normalizeQuestionnaire()` must explicitly reject deprecated keys because JSON schema extra-property behavior is not sufficient for a hard cut.
- `NormalizedQuestionnaire` must no longer carry `allowPartialSubmit`.
- `NormalizedChoiceQuestion` must no longer carry `required`, `allowOther`, or `initialIndexes`.
- `NormalizedTextQuestion` must no longer carry `required`; it may carry `recommendation?: string` and `placeholder?: string`.
- Update `api.ts` / `index.ts` exports only for type names that still exist after this task.

## Verification
The task is complete when:
```bash
RTK_DISABLED=1 pnpm vitest run packages/supi-ask-user/__tests__/unit/normalize.test.ts -v
```
passes. Package-wide typecheck is expected to be restored by later tasks after downstream files are updated to the new types.
