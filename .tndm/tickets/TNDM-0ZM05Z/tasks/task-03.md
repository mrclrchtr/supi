# Task 3: Add n-driven note editing to the ask-user overlay for choice options

# Goal
Let users press `n` on any focused choice option to edit that option's note without changing the current form flow.

# Change
- Add a dedicated note-editor mode in `packages/supi-ask-user/src/ui/overlay.ts` that reuses the existing editor surface.
- Only open note editing when focus is on a real choice option; ignore `n` on text questions and exceptional action rows.
- Prefill the editor with the focused option's current note.
- `Enter` saves the note and returns to choice mode without auto-submitting the question.
- `Esc` closes the note editor and returns to choice mode instead of cancelling the whole form.
- Update `packages/supi-ask-user/src/ui/overlay-view.ts` to surface a compact row-level note marker and include `n` in the choice footer hint.
- Update `packages/supi-ask-user/src/ui/overlay-render.ts` so the note editor has a clear label and still works with preview layouts.
- Cover opening, saving, cancel-closing, and multi-select note removal in `packages/supi-ask-user/__tests__/unit/ui-overlay.test.ts`.

# Verification
Run the targeted overlay test command and confirm the note-edit interaction passes end to end.
