# CLAUDE.md

This file provides guidance to Claude Code when working in `packages/supi-ask-user/`.

## Scope

`@mrclrchtr/supi-ask-user` provides the structured `ask_user` tool and rich questionnaire UI for agent-user decisions.

Entrypoint: `ask-user.ts`

## Behavior notes

- The extension has a split flow:
  - rich overlay via `ctx.ui.custom()` when available
  - fallback dialog when rich custom UI is unavailable
- `schema.ts`, `README.md`, and tool prompt guidance should stay aligned with runtime behavior; together they define the model-facing `ask_user` contract.
- `allowOther` is supported on `multichoice` as a mutually exclusive freeform alternative path.
- `multichoice` -> `other`/`discuss` must clear staged selections/notes so revisits reflect the stored answer.
- Fallback UI does **not** support notes, previews, or inline editing, but it does support review + revise flows.
- Normalization trims question ids and structured option values before they reach the shared internal model.
- On cancel/abort, call `ctx.abort()` so the agent turn stops; the questionnaire result should still be recorded in the transcript.

## Key files

- `ask-user.ts` — tool registration
- `schema.ts`, `types.ts`, `normalize.ts` — input model and normalization
- `flow.ts`, `result.ts`, `format.ts` — execution/result shaping
- `ui-rich*.ts` — rich overlay state, rendering, inline editing, and handlers
- `ui-fallback.ts` — degraded path when custom UI is unavailable

## Testing

- `captured.value.handleInput?.(...)` + `captured.value.render(width)` — simplest rich-UI regression test pattern in this package.
- `pnpm exec biome check packages/supi-ask-user && pnpm vitest run packages/supi-ask-user/ && pnpm exec tsc --noEmit -p packages/supi-ask-user/tsconfig.json && pnpm exec tsc --noEmit -p packages/supi-ask-user/__tests__/tsconfig.json` — fast full-package validation before commit.

When changing rich UI behavior, run the guidance and rich UI smoke tests:
```bash
pnpm vitest run packages/supi-ask-user/
```
