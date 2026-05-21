# Task 4: Document note support and run final supi-ask-user verification

# Goal
Leave the package docs and verification state aligned with the new note behavior.

# Change
- Update `packages/supi-ask-user/README.md` so choice-question controls mention the `n` shortcut, the behavior section explains which question types support notes, and the result section shows note-bearing `choice.selections[]` entries.
- Ensure the README examples and prose match the implemented semantics: non-empty note saves select the option if needed, clearing a note leaves selection state alone, and deselecting a multi-select option removes its note.
- Run the full package-level test, typecheck, and Biome commands after the implementation tasks are complete.

# Verification
Use the full package verification command and confirm all steps pass.
