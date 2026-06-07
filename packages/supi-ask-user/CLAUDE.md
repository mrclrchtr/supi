# CLAUDE.md

This file provides guidance when working in `packages/supi-ask-user/`.

## Scope

`@mrclrchtr/supi-ask-user` provides the redesigned `ask_user` tool: a small decision-form workflow for agent-user handoff.

Entrypoint: `src/ask-user.ts`

## Design rules

- Treat `ask_user` as a **decision form**, not a survey engine.
- Keep the public contract aligned across `schema.ts`, `README.md`, and `tool/guidance.ts`.
- The controller in `src/session/controller.ts` is the source of truth for form state and terminal outcomes.
- UI renderers are adapters. They should not invent extra answer semantics.
- Prefer simple explicit outcomes: `submitted`, `partial`, `discuss`, `cancelled`, `aborted`.

## Current architecture

1. **Schema** — `src/schema.ts`
2. **Normalization** — `src/normalize.ts`
3. **Headless state** — `src/session/controller.ts`
4. **Renderer selection** — `src/ui/choose-renderer.ts`
5. **UI renderers**
   - `src/ui/choose-renderer.ts`
   - `src/ui/overlay.ts`
   - `src/ui/overlay-view.ts`
   - `src/ui/overlay-render.ts`
   - `src/ui/overlay-actions.ts`
6. **Result + transcript rendering**
   - `src/render/result.ts`
   - `src/render/transcript.ts`
   - `src/render/tree-summary.ts`

## Tool contract notes

- `allowOther` is only valid on single-select choice questions.
- `allowPartialSubmit` is form-level and only meaningful when partial progress is actionable.
- Cancellation and abort call `ctx.abort()` from `ask-user.ts`.
- A session-scoped lock prevents concurrent `ask_user` interactions.
- In the rich overlay, choice questions use `Space` to select or toggle and `Enter` to submit.
- In the rich overlay, text questions open with the editor visible immediately — there is no `Enter response…` row.
- The rich overlay keeps only exceptional rows visible (`Other…`, `Discuss instead…`, `Submit partial answers`, optional `Skip question`). Back and cancel stay keyboard-only (`←`, `Esc`).
- Wide terminals render choice previews in a side-by-side split; narrow terminals stack the preview below.
- The rich overlay is now built primarily on PI/TUI primitives (`SelectList`, `Editor`, `Markdown`) rather than manual row rendering.
- `ask_user` now requires `ctx.ui.custom()`; there is no basic dialog fallback.

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
    overlay.ts
    overlay-view.ts
    overlay-render.ts
    overlay-actions.ts
    types.ts
  render/
    result.ts
    transcript.ts
    tree-summary.ts
  tool/
    guidance.ts
```


