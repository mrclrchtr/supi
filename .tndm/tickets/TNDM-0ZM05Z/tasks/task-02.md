# Task 2: Add controller helpers and invariants for per-option choice notes

# Goal
Make `AskUserController` the single place that normalizes and mutates note-bearing choice selections.

# Change
- Add controller-level helpers to read and update the note for one choice option without forcing the overlay to rebuild the whole answer shape manually.
- Trim note strings before storing them and drop empty notes instead of preserving whitespace-only values.
- When saving a non-empty note for an unselected option, auto-select that option.
- When a multi-select option is deselected, remove its note along with the selection.
- Keep existing submit / partial / discuss behavior unchanged apart from preserving note-bearing selections in `answersById`.
- Cover these invariants in `packages/supi-ask-user/__tests__/unit/controller.test.ts`.

# Verification
Run the targeted controller test command and confirm all note-specific cases pass.
