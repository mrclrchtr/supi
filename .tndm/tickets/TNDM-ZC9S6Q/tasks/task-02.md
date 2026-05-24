# Task 2: Rework brief synthesis and command wiring to consume serialized session context

## Goal
Feed the brief synthesizer a compaction-style serialized session transcript plus snapshot metadata and optional note.

## Required changes
- In `packages/supi-review/src/history/synthesize.ts`, replace the `Session evidence` section with a `Serialized session context` section and adjust the instructions so the model produces a review brief from the whole transcript rather than ranked snippets.
- Keep the bounded diff excerpt behavior.
- In `packages/supi-review/src/review.ts`, replace the `collectHistoryEvidence(...)` call with the new serializer call built from `buildSessionContext(...)`.
- Update `packages/supi-review/__tests__/unit/history-synthesize.test.ts` to assert the new prompt shape.
- Update `packages/supi-review/__tests__/unit/review-command.test.ts` so it mocks/asserts the serializer path instead of evidence scoring.
- If `evidenceCount` is removed from `SynthesizedReviewBrief`, update all remaining unit-test brief fixtures in the listed files to the new contract.

## Red step
Make the prompt and command tests fail first by asserting the new serialized-context flow.

## Green step
Implement the prompt and wiring changes until the targeted tests pass.

## Refactor
Keep the brief-runner contract stable unless a type cleanup is required by the removed evidence metadata.
