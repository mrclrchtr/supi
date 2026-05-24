# Task 1: Replace heuristic history collection with a compaction-style session serializer

## Goal
Replace `collectHistoryEvidence(...)` with a deterministic history-preparation function that mirrors Pi compaction's transcript-style input instead of ranking snippets.

## Required changes
- In `packages/supi-review/src/history/collect.ts`, replace the scoring/token-matching collector with a serializer over resolved `SessionContext["messages"]` entries.
- Preserve message order from the resolved context.
- Serialize messages in a compaction-style label format so the synthesizer sees a readable transcript instead of isolated evidence bullets.
- Keep compaction and branch summaries explicit in the serialized output.
- Add a bounded-output strategy so long sessions do not create unbounded prompt input.
- In `packages/supi-review/src/types.ts`, remove `HistoryEvidence` and introduce any lightweight shared type actually needed by the new serializer output. Also remove `evidenceCount` from `SynthesizedReviewBrief` if it becomes dead metadata.

## Red step
Update `packages/supi-review/__tests__/unit/history-collect.test.ts` first so it fails against the old collector for the right reason.

## Green step
Implement the serializer with the minimum logic needed to satisfy the new deterministic transcript tests.

## Refactor
Keep helper functions local and small; do not reintroduce scoring or ranking logic.
