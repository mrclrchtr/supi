# CLAUDE.md

This file provides guidance to Claude Code when working in `packages/supi-ask-user/`.

## Scope

`@mrclrchtr/supi-ask-user` provides the structured `ask_user` tool and rich questionnaire UI for agent-user decisions.

Entrypoint: `ask-user.ts`

## Behavior notes

- `ask_user` requires a TUI with custom overlay support (`ctx.ui.custom()`). In non-interactive or degraded UI sessions, it returns an error — there is no fallback dialog.
- `schema.ts`, `README.md`, and tool prompt guidance should stay aligned with runtime behavior; together they define the model-facing `ask_user` contract.
- Normalization trims question ids and structured option values before they reach the shared internal model.
- `multichoice` -> `other`/`discuss` must clear staged selections/notes so revisits reflect the stored answer.

## Questionnaire pipeline

The `ask_user` tool processes questionnaires through a staged pipeline:

1. **Schema validation** (`schema.ts`) — validates input against `QuestionnaireSchema` (TypeBox). Rejects malformed shapes before normalization.
2. **Normalization** (`normalize.ts`) — trims question IDs and structured option values so they stay consistent across encoding layers.
3. **Execution flow** (`flow.ts`) — single-active-questionnaire lock, answer tracking, review + revise state machine.
4. **Rich overlay** (`ui/ui-rich.ts`) — renders the interactive overlay via `ctx.ui.custom()` with inline editing, notes, previews, and keyboard handlers.
5. **Result shaping** (`result.ts`, `render.ts`) — packages structured answers into the tool result format with custom call/result rendering.

## Tool contract

- `allowOther` on `multichoice` is a mutually exclusive freeform alternative — clears staged selections when selected.
- `allowSkip` exposes a partial-submit path (sets `skip: true` on result, returns completed fields).
- Cancellation calls `ctx.abort()` to stop the agent turn; the result is still recorded in the transcript.
- Single-active-questionnaire lock — subsequent `ask_user` calls before the first resolves return an error.

## Key files

- `ask-user.ts` — tool registration + execution dispatch
- `schema.ts`, `types.ts`, `normalize.ts` — input model and normalization
- `flow.ts` — shared questionnaire flow + concurrency lock
- `result.ts`, `render.ts`, `format.ts` — result shaping + custom rendering
- `ui/ui-rich.ts` — overlay rendering via `ctx.ui.custom()`
- `ui/ui-rich-state.ts` — overlay state management
- `ui/ui-rich-handlers.ts` — keyboard + interaction handlers
- `ui/ui-rich-inline.ts` — inline editing support

## Commands

```bash
pnpm vitest run packages/supi-ask-user/
pnpm exec tsc --noEmit -p packages/supi-ask-user/tsconfig.json
pnpm exec tsc --noEmit -p packages/supi-ask-user/__tests__/tsconfig.json
pnpm exec biome check packages/supi-ask-user/
```

## Testing

- `captured.value.handleInput?.(...)` + `captured.value.render(width)` — simplest rich-UI regression test pattern in this package.
- When changing rich UI behavior, run the full suite: `pnpm vitest run packages/supi-ask-user/`
