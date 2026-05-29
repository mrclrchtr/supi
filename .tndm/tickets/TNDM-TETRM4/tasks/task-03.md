# Task 3: Document chat-history ask_user review behavior in the package README

# Goal
Make the new read-only review behavior discoverable in package docs without implying that the form can be reopened interactively.

## Files
- `packages/supi-ask-user/README.md`

## Change
Add a concise README note describing that, in Pi's normal chat history, completed `ask_user` results can be reviewed in a read-only expanded view via Pi's tool expansion control (`Ctrl+O`). Place the note in an existing user-facing behavior/UI section so it stays near the rest of the interaction guidance.

The wording must stay aligned with the approved design:
- normal chat history only
- read-only review
- not `/tree`
- not reopening the live form

## Verification
Run:

```bash
rg -n "Ctrl\+O|chat history|read-only review" packages/supi-ask-user/README.md
```

Expected result: the README contains a concise line that mentions normal chat history and read-only review via `Ctrl+O`.

## Test mode
Test-exempt. This is a docs-only change; manual text verification is sufficient.
