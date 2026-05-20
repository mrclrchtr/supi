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
   - `src/ui/overlay.ts`
   - `src/ui/dialog.ts`
6. **Result + transcript rendering**
   - `src/render/result.ts`
   - `src/render/transcript.ts`
   - `src/render/tree-summary.ts`

## Tool contract notes

- `allowOther` is only valid on single-select choice questions.
- `allowDiscuss` is form-level, not per-question.
- `allowPartialSubmit` is form-level and only meaningful when partial progress is actionable.
- Cancellation and abort call `ctx.abort()` from `ask-user.ts`.
- A session-scoped lock prevents concurrent `ask_user` interactions.

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
    dialog.ts
    overlay.ts
    types.ts
  render/
    result.ts
    transcript.ts
    tree-summary.ts
  tool/
    guidance.ts
```

## Commands

```bash
pnpm vitest run packages/supi-ask-user/
pnpm exec tsc --noEmit -p packages/supi-ask-user/tsconfig.json
pnpm exec tsc --noEmit -p packages/supi-ask-user/__tests__/tsconfig.json
pnpm exec biome check packages/supi-ask-user/
```
