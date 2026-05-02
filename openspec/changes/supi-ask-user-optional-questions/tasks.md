## 1. Schema and Types

- [x] 1.1 Add `required?: boolean` (default `true`) to the question schema in `packages/supi-ask-user/schema.ts`
- [x] 1.2 Add `allowSkip?: boolean` to the top-level questionnaire schema
- [x] 1.3 Update TypeScript types (`types.ts`) to reflect optional question and skip action fields

## 2. Flow Engine

- [x] 2.1 Update `packages/supi-ask-user/flow.ts` to track which questions are optional vs required
- [x] 2.2 Implement skip logic: when skip is triggered, build a partial result with `skip: true` and `undefined` for unanswered optional questions
- [x] 2.3 Ensure required questions still block submission until answered
- [x] 2.4 Update result normalization (`result.ts`) to preserve `undefined` values for unanswered optional questions

## 3. UI Rendering

- [x] 3.1 Update `packages/supi-ask-user/ui-rich-render.ts` to visually distinguish optional questions (e.g., no required indicator)
- [x] 3.2 Render the Skip action button when `allowSkip: true` or optional questions exist
- [x] 3.3 Ensure keyboard navigation supports the Skip action alongside Submit and Cancel
- [x] 3.4 Update `ui-rich-render-editor.ts` if the inline editor needs optional-question affordances

## 4. Integration and Fallback

- [x] 4.1 Update `ui-fallback.ts` to handle partial results and skip in non-interactive / RPC contexts
- [x] 4.2 Update `ask-user.ts` (the main tool entrypoint) to pass the new schema fields through to the flow engine
- [x] 4.3 Update the tool result shape to include `skip?: true` when applicable

## 5. Tests

- [x] 5.1 Add unit tests for partial result building with optional questions
- [x] 5.2 Add unit tests for skip action behavior (skip vs cancel)
- [x] 5.3 Add tests verifying required questions still block submission
- [x] 5.4 Run `pnpm test` for `packages/supi-ask-user/` and ensure all pass

## 6. Documentation

- [x] 6.1 Update the `supi-ask-user` guide (`packages/supi-ask-user/resources/supi-ask-user-guide/SKILL.md`) with optional questions and skip usage examples
- [x] 6.2 Add a short example in the skill showing a chained exploration questionnaire
