# Task 2: Implement compact summary and expanded review rendering for ask_user transcript cards

# Goal
Make normal chat-history `ask_user` tool cards render the approved collapsed summary by default and a read-only review when Pi expands tool output.

## Files
- `packages/supi-ask-user/src/ask-user.ts`
- `packages/supi-ask-user/src/render/transcript.ts`

## Change
1. In `packages/supi-ask-user/src/ask-user.ts`, forward Pi's tool render options from the tool registration callback into `renderAskUserResult(...)` instead of discarding them.
2. In `packages/supi-ask-user/src/render/transcript.ts`, update `renderAskUserResult(...)` to accept the render options Pi provides.
3. Implement a collapsed render path that produces:
   - a status/answered-count summary line
   - at most 2 answer lines
   - one dim meta line combining the highest-value extras available (`missing required`, `discussion message included`, hidden-answer count, `Ctrl+O to review`)
4. Implement an expanded render path that produces a read-only review with:
   - status/answered-count summary
   - optional title and intro
   - every question in original order with header, prompt, and either the selected answer or `Not answered`
   - discuss message and missing-required summary when relevant
5. Reuse existing helpers such as `formatAnswerSummary(...)` and `formatMissingHeaders(...)`; do not change the persisted result shape or introduce duplicate presentation fields.
6. Keep error rendering unchanged.

## Verification
### GREEN
Run:

```bash
RTK_DISABLED=1 pnpm vitest run packages/supi-ask-user/__tests__/unit/transcript.test.ts -v
pnpm exec tsc -b packages/supi-ask-user/tsconfig.json packages/supi-ask-user/__tests__/tsconfig.json
```

Expected result: transcript tests pass and the package/test TypeScript builds succeed with the new renderer signature.

## Test mode
Test-driven. Start from the failing tests created in Task 1 and do not complete this task until they pass.
