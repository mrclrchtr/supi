# CLAUDE.md

`@mrclrchtr/supi-ask-user` provides the redesigned `ask_user` tool: a small decision-form workflow for agent-user handoff.

Entrypoint: `src/ask-user.ts`

## Design rules

- Treat `ask_user` as a **decision form**, not a survey engine.
- Keep the public contract aligned across `schema.ts`, `README.md`, and `tool/guidance.ts`.
- The controller in `src/session/controller.ts` is the source of truth for selections, text values, form/question/option comments, unanswered state, navigation, and derived outcome.
- UI renderers are adapters — they should not invent extra answer semantics.
- All questions are expected for full submission. Unanswered questions produce `needs_discussion` outcome.
- Internal cancel/abort interaction results are NOT persisted as user responses — they are control-flow signals that abort the turn.

## Removed features (hard cut)

- `allowPartialSubmit`, `required`, `initial`, `allowOther` — no longer supported. All questions are expected.
- Action rows (`Other…`, `Discuss instead…`, `Submit partial answers`, `Skip question`) — removed.
- `answersById`, `missingQuestionIds` — replaced by ordered `responses` array.
- `status: "partial" | "discuss" | "cancelled" | "aborted"` — replaced by `outcome: "submitted" | "needs_discussion"` plus `AskUserInteractionResult` for cancel/abort.

## Architecture

1. **Schema** — `src/schema.ts`
2. **Normalization** — `src/normalize.ts` (rejects deprecated fields)
3. **Headless state** — `src/session/controller.ts`
4. **Renderer selection** — `src/ui/choose-renderer.ts`
5. **UI renderers** — `src/ui/form*.ts`
6. **Result + transcript** — `src/render/result.ts`, `src/render/transcript.ts`, `src/render/tree-summary.ts`
7. **Tool guidance** — `src/tool/guidance.ts` (model-facing description, single source of truth)

## Package surfaces

- `@mrclrchtr/supi-ask-user/extension` — pi extension entrypoint
- `@mrclrchtr/supi-ask-user/api` — reusable types and utilities

```ts
import { normalizeQuestionnaire, AskUserController } from "@mrclrchtr/supi-ask-user/api";
```

## Non-obvious behavior

- Requires pi interactive (TUI) mode — no degraded fallback.
- Only one `ask_user` form may be active at a time; a session-scoped lock enforces this.
- Cancellation/abort stops the current agent turn (returns `AskUserInteractionResult`, then `ctx.abort()`).
- Final question always moves to **review**, never submits directly. Submit row is focused by default so a single `Enter` submits.
- When a question is opened from review, saving/advancing returns to review instead of walking through later questions.
- `Enter` on single-select selects the focused option **and advances**; on multi-select it accepts current selections and advances (no toggling).
- Text questions reserve printable input for the editor; use `Alt+C` for question comments and `Alt+U` for unanswered. On choice questions, plain `c` and `u` work.
- Option comments are **preserved on deselection** — only removed when explicitly cleared. Only touched options (selected and/or commented) appear in responses.
- In comment editors, `Esc` discards unsaved edits and returns to form/review **without cancelling the interaction**.
- `recommendation` on single-select defaults to first option; on multi-select defaults to none.
- Completed forms are summarized in the session tree. In chat history, results can be expanded read-only with `Ctrl+O` — this does not reopen the live form.
