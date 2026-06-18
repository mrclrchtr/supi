# CLAUDE.md

This file provides guidance when working in `packages/supi-ask-user/`.

## Scope

`@mrclrchtr/supi-ask-user` provides the redesigned `ask_user` tool: a small decision-form workflow for agent-user handoff.

Entrypoint: `src/ask-user.ts`

## Design rules

- Treat `ask_user` as a **decision form**, not a survey engine.
- Keep the public contract aligned across `schema.ts`, `README.md`, and `tool/guidance.ts`.
- The controller in `src/session/controller.ts` is the source of truth for selections, text values, form/question/option comments, unanswered state, navigation, and derived outcome.
- UI renderers are adapters. They should not invent extra answer semantics.
- All questions are expected for full submission. Unanswered questions produce `needs_discussion` outcome.
- Internal cancel/abort interaction results are NOT persisted as user responses — they are control-flow signals that abort the turn.

## Removed features (hard cut — no backward compatibility)

- `allowPartialSubmit`: no longer supported. All questions are expected for full submission.
- `required`: no longer supported. The concept of optional questions is removed.
- `initial`: no longer supported. Use `recommendation` on choice or text questions.
- `allowOther`: no longer supported. No "Other…" action rows.
- `status: "partial"`, `status: "discuss"`, `status: "cancelled"`, `status: "aborted"`: replaced by `outcome: "submitted" | "needs_discussion"` plus `AskUserInteractionResult` for internal cancel/abort.
- `answersById`, `missingQuestionIds`: replaced by ordered `responses` array.
- Action rows (`Other…`, `Discuss instead…`, `Submit partial answers`, `Skip question`): removed. Keyboard-only navigation via `Tab`/`Shift+Tab`.

## Current architecture

1. **Schema** — `src/schema.ts`
2. **Normalization** — `src/normalize.ts` (rejects deprecated fields)
3. **Headless state** — `src/session/controller.ts` (comments, answers, navigation, outcome)
4. **Renderer selection** — `src/ui/choose-renderer.ts`
5. **UI renderers**
   - `src/ui/form.ts`
   - `src/ui/form-component.ts` (keyboard orchestration)
   - `src/ui/form-view.ts`
   - `src/ui/form-render.ts`
   - `src/ui/types.ts`
6. **Result + transcript rendering**
   - `src/render/result.ts`
   - `src/render/transcript.ts`
   - `src/render/tree-summary.ts`

## Tool contract notes

- Deprecated fields (`allowPartialSubmit`, `required`, `initial`, `allowOther`) are explicitly rejected during normalization.
- `recommendation` on single-select defaults to first option; on multi-select defaults to none.
- The recommended/preselected choice option is rendered with a `[recommended]` label.
- Text questions accept `recommendation?: string` (trimmed; blank omitted) and `placeholder?: string`.
- Cancellation and abort return `AskUserInteractionResult` to the execution boundary which calls `ctx.abort()`.
- A session-scoped lock prevents concurrent `ask_user` interactions.
- In the form, `Tab`/`Shift+Tab` and `←`/`→` navigate between questions. The last question goes to review.
- Review screen shows answered/unanswered markers, option comments, a Submit row, and a form-level comment path via `c`.
- `Enter` on a review question opens that question for editing; saving/advancing a review-opened question returns to review.
- `Enter` on the Submit row submits the form.
- Text question screens reserve printable input for the editor; use `Alt+C` for question comments and `Alt+U` for unanswered.
- Comments exist at form, question, and option levels. Blank comments are removed.
- Only touched choice options (selected and/or commented) appear in response output.
- Option comments are preserved on deselection — they are only removed when explicitly cleared.
- `Esc` cancels the form (returning an internal cancel result) from question and review screens.
- In comment editors, `Esc` discards unsaved comment edits and returns to the previous form/review screen without cancelling the interaction.
- Final question always moves to review, never submits directly.
- Preview renders for the focused option when `preview` text is present.

## Package layout

```text
src/
  api.ts
  index.ts
  extension.ts
  ask-user.ts
  schema.ts
  types.ts
  normalize.ts
  session/
    controller.ts
    lock.ts
  ui/
    choose-renderer.ts
    form.ts
    form-component.ts
    form-view.ts
    form-render.ts
    form-review-render.ts
    form-render-primitives.ts
    types.ts
  render/
    result.ts
    transcript.ts
    tree-summary.ts
  tool/
    guidance.ts
```
