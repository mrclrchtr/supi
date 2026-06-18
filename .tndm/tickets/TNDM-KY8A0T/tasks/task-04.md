# Task 4: Rebuild form keyboard flow with review screen and comment editors

## Goal
Replace the current action-row wizard with the approved compact tabbed form UX: explicit selection state, comments at every level, unanswered marking, and review-before-submit. This task fixes the original multi-select Enter bug by design.

## Files
- `packages/supi-ask-user/__tests__/unit/ui-form.test.ts`
- `packages/supi-ask-user/__tests__/helpers/index.ts`
- `packages/supi-ask-user/src/ui/form-component.ts`
- `packages/supi-ask-user/src/ui/form-view.ts`
- `packages/supi-ask-user/src/ui/form-render.ts`
- `packages/supi-ask-user/src/ui/form-actions.ts` (delete if unused)
- `packages/supi-ask-user/src/ui/types.ts`
- `packages/supi-ask-user/src/ui/form.ts`

## TDD steps
1. RED: Rewrite `ui-form.test.ts` first and run:
   ```bash
   RTK_DISABLED=1 pnpm vitest run packages/supi-ask-user/__tests__/unit/ui-form.test.ts -v
   ```
   Expected red result: tests fail because the current form still uses exceptional rows and old submit/discuss/partial behavior.
2. GREEN: Rebuild the form state orchestration, view helpers, and renderer until the same command passes.

## Required test coverage
- Single-select choice starts with the recommended option selected; when no recommendation exists, it starts with the first option selected.
- `Enter` on a single-select choice selects the focused option and advances to the next question or review.
- Multi-select choice starts with all recommended options selected and no selection when recommendation is absent.
- `Space` toggles a multi-select option.
- `Enter` on a multi-select question advances without toggling or unselecting the focused option.
- `Tab` jumps forward by question and moves from the final question to review.
- `Shift+Tab` jumps backward by question and moves from review to the final question.
- The final question never submits directly; it moves to review first.
- `u` marks the current question unanswered while preserving question and option comments.
- `c` edits the current question comment on question screens and the form-level comment on review.
- `n` edits the focused option comment for selected and unselected choice options.
- Review screen shows answered/unanswered state and `Enter` submits the derived outcome.
- `Esc` returns an internal cancel result that the execution boundary can abort.
- The rendered UI no longer contains `Other…`, `Discuss instead…`, `Submit partial answers`, or `Skip question` rows.

## Implementation notes
- Do not rely on `SelectList.onSelect` for multi-select submission. Handle `Enter` and `Space` explicitly in `AskUserForm` so selection and advancement cannot conflict.
- Use existing PI/TUI primitives where they fit, but keep answer semantics in `AskUserController`.
- Introduce a review mode in the form mode/view model rather than representing review as a fake question.
- Comment editors may reuse the existing `Editor`; after saving a comment, return to the previous question or review screen.
- If `form-actions.ts` becomes unused, delete it and remove stale imports/tests.
- Keep preview rendering for focused choice options when `preview` text is present.

## Verification
The task is complete when:
```bash
RTK_DISABLED=1 pnpm vitest run packages/supi-ask-user/__tests__/unit/ui-form.test.ts -v
```
passes.
