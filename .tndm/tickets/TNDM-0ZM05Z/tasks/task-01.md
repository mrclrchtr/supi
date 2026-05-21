# Task 1: Add note-aware result formatting tests and extend choice selection data

# Goal
Teach the public result shape and text summaries to carry per-selection notes for `choice` answers.

# Change
- Extend `packages/supi-ask-user/src/types.ts` so each `choice` selection can carry an optional trimmed `note` string.
- Add concise JSDoc explaining that notes belong to individual selected options and are absent for `text` / `custom` answers.
- Update `packages/supi-ask-user/src/render/result.ts` so note-bearing selections render in summaries as `Label (note: text)` while preserving selection order.
- Update `packages/supi-ask-user/__tests__/unit/ask-user.test.ts` to prove tool results preserve note-bearing selections and expose them in `content[0].text`.
- Update `packages/supi-ask-user/__tests__/unit/transcript.test.ts` to prove transcript rendering stays readable when notes are present.

# Verification
Run the targeted Vitest command and confirm the new note assertions pass.
