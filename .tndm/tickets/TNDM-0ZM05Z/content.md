## Plan Overview
Add per-option note support to `packages/supi-ask-user` choice questions without changing the external `ask_user` tool-call schema. Users will press `n` on any focused choice option to open a note editor. Each note is stored on the selected option entry inside `details.answersById[questionId].selections[]` as an optional `note` field.

Single-select behavior:
- pressing `n` on an option opens the note editor prefilled with that option's current note
- saving a non-empty note selects that option if it is not already selected
- clearing the note removes only the note; it does not clear the selection

Multi-select behavior:
- saving a non-empty note selects the option if needed
- clearing the note removes only the note
- deselecting an option removes its note along with the selection

Scope limits:
- no schema change in `packages/supi-ask-user/src/schema.ts`
- no notes for `text` questions
- no notes for `allowOther` custom answers or other exceptional action rows
- `Esc` while editing a note closes the note editor instead of cancelling the whole form

## File map
- `packages/supi-ask-user/src/types.ts` — extend choice-selection data with an optional `note` field and document the exported semantics.
- `packages/supi-ask-user/src/session/controller.ts` — normalize note strings, preserve note-bearing selections in outcomes, and expose note-aware selection helpers used by the overlay.
- `packages/supi-ask-user/src/ui/overlay.ts` — add a note-editing mode, `n` keyboard handling for focused choice options, and note-save / note-cancel behavior.
- `packages/supi-ask-user/src/ui/overlay-view.ts` — add note markers for choice rows and note-aware footer hints.
- `packages/supi-ask-user/src/ui/overlay-render.ts` — render the note editor label/layout while preserving existing preview and choice rendering.
- `packages/supi-ask-user/src/render/result.ts` — include note text in the tool-result summary so model-visible content and transcript rendering surface it.
- `packages/supi-ask-user/__tests__/unit/ask-user.test.ts` — verify tool results preserve note-bearing selections and summarize them correctly.
- `packages/supi-ask-user/__tests__/unit/controller.test.ts` — verify note trimming, auto-selection, persistence, and deselect cleanup.
- `packages/supi-ask-user/__tests__/unit/transcript.test.ts` — verify rendered summaries show note-bearing selections readably.
- `packages/supi-ask-user/__tests__/unit/ui-overlay.test.ts` — verify `n` opens/closes note editing, saves notes without auto-submitting, and keeps multi-select note semantics correct.
- `packages/supi-ask-user/README.md` — document the `n` shortcut, note availability limits, and returned result shape.

## Verification strategy
Use TDD for the behavior tasks: write the targeted failing tests first, then implement the minimal code to pass them. Finish with package-level verification:

```bash
pnpm vitest run packages/supi-ask-user/ -v
pnpm exec tsc --noEmit -p packages/supi-ask-user/tsconfig.json
pnpm exec tsc --noEmit -p packages/supi-ask-user/__tests__/tsconfig.json
pnpm exec biome check packages/supi-ask-user
```
