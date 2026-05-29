# Implementation Overview

## Scope
Add a read-only review mode for `ask_user` results in the **normal chat history** by using Pi's built-in expanded tool-output rendering. This change stays within `packages/supi-ask-user` and does not alter the tool schema, persisted result shape, or live overlay behavior.

## Delivery strategy
Use a light implementation plan with test-first coverage for the transcript renderer:

- keep the current `AskUserDetails` payload as the only source of truth
- upgrade the collapsed transcript card to show a compact, higher-value summary
- render a fuller read-only questionnaire review when Pi marks the tool row as expanded
- leave cancellation, session data, `/tree`, and `/resume` behavior unchanged

## File map
- `packages/supi-ask-user/src/ask-user.ts`
  - forward Pi's tool render options into `renderAskUserResult(...)` instead of discarding them
- `packages/supi-ask-user/src/render/transcript.ts`
  - implement separate collapsed and expanded transcript render paths
  - keep error rendering unchanged
  - reuse existing answer-formatting helpers instead of introducing a second data shape
- `packages/supi-ask-user/__tests__/unit/transcript.test.ts`
  - add regression coverage for collapsed summaries and expanded review rendering
- `packages/supi-ask-user/README.md`
  - document that normal chat-history `ask_user` results can be reviewed via Pi's tool expansion control

## Rendering requirements

### Collapsed transcript card
Render a compact summary with:
- status plus answered-count line
- up to 2 answer lines
- one dim meta line that can combine:
  - missing-required count
  - discussion-message presence
  - hidden-answer count when more than 2 answers exist
  - review hint (`Ctrl+O to review`)

### Expanded transcript card
Render a read-only review with:
- status plus answered-count line
- optional title
- optional intro
- each question in original order with header, prompt, and either the selected answer or `Not answered`
- status-specific extras for discuss message and missing required answers

### Explicit non-goals
Do **not** show unselected options, previews, editable controls, or a reopened live form.

## Verification strategy
- start with transcript tests that fail for the current compact-only renderer
- implement the renderer changes until those tests pass
- finish with package-scoped verification and one interactive manual smoke test in Pi to confirm the chat-history expand/collapse behavior matches the documented UX