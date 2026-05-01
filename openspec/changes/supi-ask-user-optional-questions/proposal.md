## Why

The `ask_user` tool is excellent for explicit user decisions, but exploration mode conversations often surface multiple open threads that aren't all blocking. Today, presenting these via `ask_user` feels like an interrogation — every question demands an answer before continuation. Users who prefer structured thinking surfaces want to answer selectively or skip entirely, but the tool doesn't support optional questions or graceful partial responses.

## What Changes

- **Optional questions**: Mark individual questionnaire questions as `required: false`. Users can answer zero, one, or many. The extension receives partial results and continues with whatever was answered.
- **Skip as first-class action**: Add a dedicated "Skip" option alongside "Submit" and "Discuss" so users can opt out of the entire questionnaire without canceling the interaction.
- **Chained / progressive questionnaires**: Allow extensions to ask a small initial set, receive partial results, then conditionally ask follow-up questions. This mirrors how human exploration works.
- **Discussion-as-default**: Introduce an exploration-friendly questionnaire mode where `allowDiscuss: true` is visually prominent and the UI nudges toward freeform typing rather than rigid form completion.
- **Optional questions in `supi-ask-user` schema**: Extend the `ask-user` tool schema to support a `required` field (default `true`) on each question.
- **Flow engine updates**: Update the flow engine in `packages/supi-ask-user` to handle partial results, skip states, and chained questionnaire lifecycles.

## Capabilities

### New Capabilities
- `ask-user-optional-questions`: Support for marking individual questions as optional and receiving partial answers.
- `ask-user-skip-action`: First-class skip/cancel behavior that preserves conversation flow instead of aborting.
- `ask-user-chained-questionnaires`: Progressive, multi-step questionnaires that can be emitted conditionally based on prior answers.

### Modified Capabilities
- *(none — this is additive to the existing `ask-user` contract)*

## Impact

- `packages/supi-ask-user` schema, flow engine, and UI handlers.
- `packages/supi-ask-user/ask-user.ts` — tool definition and result normalization.
- `packages/supi-ask-user/flow.ts` — questionnaire lifecycle and partial result handling.
- `packages/supi-ask-user/ui-rich-render.ts` / `ui-rich-render-editor.ts` — UI rendering for optional states and skip action.
- Settings registry in `supi-core` if we add a global default for `required`.
