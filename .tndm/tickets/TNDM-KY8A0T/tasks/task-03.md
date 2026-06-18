# Task 3: Update tool execution and transcript/result rendering for the new outcome shape

## Goal
Make the `ask_user` tool boundary and chat-history rendering consume the new successful outcome shape and treat cancel/abort as control flow, not persisted user responses.

## Files
- `packages/supi-ask-user/__tests__/unit/ask-user.test.ts`
- `packages/supi-ask-user/__tests__/unit/transcript.test.ts`
- `packages/supi-ask-user/src/ask-user.ts`
- `packages/supi-ask-user/src/render/result.ts`
- `packages/supi-ask-user/src/render/transcript.ts`
- `packages/supi-ask-user/src/render/tree-summary.ts`
- `packages/supi-ask-user/src/ui/types.ts`
- `packages/supi-ask-user/src/ui/form.ts`
- `packages/supi-ask-user/src/ui/choose-renderer.ts`

## TDD steps
1. RED: Rewrite `ask-user.test.ts` and `transcript.test.ts` first, then run:
   ```bash
   RTK_DISABLED=1 pnpm vitest run packages/supi-ask-user/__tests__/unit/ask-user.test.ts packages/supi-ask-user/__tests__/unit/transcript.test.ts -v
   ```
   Expected red result: tests fail because the current tool/result code still uses old `status`, `answersById`, `missingQuestionIds`, `partial`, and `discuss` semantics.
2. GREEN: Update execution and render code until the same command passes.

## Required test coverage
- Successful form submissions produce `details.outcome`, `details.comment`, and ordered `details.responses`.
- Model-visible content summarizes selected choices, text answers, form comments, question comments, option comments, and unanswered questions.
- `outcome: "submitted"` renders as complete when every response is answered.
- `outcome: "needs_discussion"` renders as incomplete/needs discussion when any response is unanswered.
- Collapsed transcript rendering shows outcome, answered count, up to two response lines, and a review hint.
- Expanded transcript rendering shows title, intro, form comment, every question, question comments, touched choice options, text values, and unanswered state.
- Internal cancel and abort interaction results call `ctx.abort()` and return an error-style tool result; they do not create `cancelled` or `aborted` details statuses.
- Unsupported UI and concurrent lock errors still return `kind: "error"` details.
- `supi:ask-user:start` and `supi:ask-user:end` events are still emitted around the interaction.

## Implementation notes
- `runQuestionnaire()` should return either a successful `AskUserOutcome`, an internal cancel/abort result, or `"unsupported"`.
- `executeAskUser()` should call `ctx.abort()` for internal cancel/abort and avoid building a successful `AskUserDetails` object for those paths.
- `AskUserDetails` should extend the new successful outcome shape with `title`, `intro`, and `questions` for rendering.
- Remove old transcript labels and branches for `partial`, `discuss`, `cancelled`, `aborted`, `answersById`, and `missingQuestionIds`.
- Keep `AskUserErrorDetails` for validation, unsupported UI, lock, cancel, and abort result rendering.

## Verification
The task is complete when:
```bash
RTK_DISABLED=1 pnpm vitest run packages/supi-ask-user/__tests__/unit/ask-user.test.ts packages/supi-ask-user/__tests__/unit/transcript.test.ts -v
```
passes. Full package typecheck is expected after the form task updates remaining callers.
