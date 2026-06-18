# Task 2: Rebuild controller around comments, unanswered state, and ordered responses

## Goal
Make `AskUserController` the source of truth for the new response model: structured answers, form/question/option comments, unanswered state, navigation, and derived successful outcome.

## Files
- `packages/supi-ask-user/__tests__/unit/controller.test.ts`
- `packages/supi-ask-user/src/types.ts`
- `packages/supi-ask-user/src/session/controller.ts`
- `packages/supi-ask-user/src/api.ts`
- `packages/supi-ask-user/src/index.ts`

## TDD steps
1. RED: Rewrite `controller.test.ts` first and run:
   ```bash
   RTK_DISABLED=1 pnpm vitest run packages/supi-ask-user/__tests__/unit/controller.test.ts -v
   ```
   Expected red result: tests fail because the current controller still returns `status`, `answersById`, `missingQuestionIds`, and `discussMessage`.
2. GREEN: Replace the old answer/status controller behavior with the new response model until the same command passes.

## Required test coverage
- Single-select questions initialize to the recommended option; if no recommendation exists, initialize to the first option.
- Multi-select questions initialize to every recommended option; if no recommendation exists, initialize with no selected options.
- Text questions initialize from `recommendation` and count as answered when the value is non-empty after trimming.
- `markCurrentQuestionUnanswered()` or equivalent clears structured selection/text while preserving form, question, and option comments.
- Question comments are stored as `questionComment` on the matching response and blank comments are removed.
- Option comments can be attached to selected or unselected options; blank comments are removed.
- Choice responses include only touched options: selected options and options with comments.
- Multi-select deselection does not delete an option comment unless the comment is explicitly cleared.
- `outcome()` returns `{ outcome: "submitted", responses }` when every question is answered.
- `outcome()` returns `{ outcome: "needs_discussion", responses }` when at least one question is unanswered, even if comments are absent.
- Responses are emitted for every question in original order.

## Implementation notes
- Replace `AskUserStatus` with a successful outcome discriminant such as `AskUserOutcomeKind = "submitted" | "needs_discussion"`.
- Replace `Answer`, `ChoiceAnswer`, `CustomAnswer`, and `TextAnswer` with response-oriented types matching the approved design.
- Add an internal interaction result type for UI cancellation/abort, separate from persisted `AskUserOutcome`.
- Keep navigation helpers (`goNext`, `goBack`, `currentQuestion`) or rename them only if all callers and tests are updated in the same task.
- Do not keep `finishPartial()`, `finishDiscuss()`, `canPartialSubmit()`, `missingQuestionIds()`, `answersById`, or `discussMessage` in the public/controller outcome model.

## Verification
The task is complete when:
```bash
RTK_DISABLED=1 pnpm vitest run packages/supi-ask-user/__tests__/unit/controller.test.ts -v
```
passes. Package-wide typecheck is expected to be restored by later tasks after UI and rendering callers are updated.
