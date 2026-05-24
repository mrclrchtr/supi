# Task 3: Slim the review packet and update preview metadata for the compact review flow

## Goal
Replace the current prompt-budget-driven inline diff packet with a compact review brief that points the reviewer at the new snapshot tools.

## Changes
- Refactor `packages/supi-review/src/target/packet.ts` so `buildReviewPacket()` keeps only compact context, such as:
  - session-derived brief
  - snapshot metadata
  - changed-file manifest
  - per-file overview / skip annotations
  - reviewer instructions that reference on-demand snapshot tools
- Remove the current large inline diff packing loop and any packet fields that only exist to describe packed diff coverage if they are no longer meaningful.
- Update `packages/supi-review/src/types.ts` if `ReviewPacket` no longer needs `includedFiles`, `omittedFiles`, or `charBudget`.
- Update `packages/supi-review/src/ui/flow.ts` so the preview reflects the new compact packet honestly (for example, no stale included/omitted/budget line if the packet no longer uses that model).
- Keep the prompt preview useful for approval while avoiding a misleading giant blob preview.
- Adjust `packages/supi-review/__tests__/unit/review-command.test.ts` expectations to the new packet shape if needed.

## Tests first
Rewrite packet tests in `packages/supi-review/__tests__/unit/packet.test.ts` to assert:
- the brief and changed-file metadata remain present
- file overview annotations still work
- the prompt no longer depends on embedding bulk diff bodies
- any new packet fields are accurate

## Done when
A large snapshot produces a compact packet by construction, and the preview UI reflects the new compact model instead of the old diff-budget model.
