# CLAUDE.md

This file provides guidance to Claude Code when working in `packages/supi-ask-user/`.

## Scope

`@mrclrchtr/supi-ask-user` provides the structured `ask_user` tool and rich questionnaire UI for agent-user decisions.

Entrypoint: `ask-user.ts`

## Behavior notes

- The extension has a split flow:
  - rich overlay via `ctx.ui.custom()` when available
  - fallback dialog when rich custom UI is unavailable
- Rich UI supports `choice`, `multichoice`, `yesno`, and `text` questions plus:
  - inline `Other` / `Discuss` editing
  - split-pane option previews
  - per-option notes
  - review/revise flows
- Fallback UI does **not** support notes, previews, or inline editing.
- On cancel/abort, call `ctx.abort()` so the agent turn stops; the questionnaire result should still be recorded in the transcript.

## Interaction gotchas

- Keyboard focus on `Other` / `Discuss` should enter inline edit mode automatically.
- In multichoice flows, `Space` toggles the highlighted option; `Enter` submits the current selection set.
- `n` edits a note on the highlighted option in multichoice mode.
- Per-option notes should survive uncheck/re-check within the same questionnaire.

## Key files

- `ask-user.ts` — tool registration
- `schema.ts`, `types.ts`, `normalize.ts` — input model and normalization
- `flow.ts`, `result.ts`, `format.ts` — execution/result shaping
- `ui-rich*.ts` — rich overlay state, rendering, inline editing, and handlers
- `ui-fallback.ts` — degraded path when custom UI is unavailable

## Testing

Useful commands:
```bash
pnpm exec vitest run packages/supi-ask-user/__tests__/guidance.test.ts
pnpm exec vitest run packages/supi-ask-user/__tests__/ui-rich.test.ts packages/supi-ask-user/__tests__/ui-rich-nav.test.ts
```

When changing rich UI behavior, run both the guidance and rich UI smoke tests.
