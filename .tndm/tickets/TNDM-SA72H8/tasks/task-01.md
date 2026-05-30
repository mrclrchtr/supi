# Task 1: RED: encode brief-selected instruction blocks in supi-review unit tests

## Goal
Lock the new contract in tests before changing implementation: the synthesized brief carries selected review-instruction block IDs, the review packet renders only those selected blocks, and reviewer prompt wording no longer says `audit hints`.

## Files
- `packages/supi-review/__tests__/unit/brief-runner.test.ts`
- `packages/supi-review/__tests__/unit/packet.test.ts`
- `packages/supi-review/__tests__/unit/runner.test.ts`
- `packages/supi-review/src/types.ts` (read for expected shape only during RED)
- `packages/supi-review/src/tool/schemas.ts` (read for expected shape only during RED)

## Change to make
- Update the brief-runner test fixture and success assertion to expect a new `reviewInstructionBlockIds` array in the submitted brief payload.
- In `packet.test.ts`, replace the current snapshot-driven audit-hint expectation with two assertions:
  1. when the brief selects a known block ID, `buildReviewPacket()` renders a mandatory-review-instructions section containing the corresponding block title/text
  2. when the brief selects no block IDs, the packet does **not** add that section even if the snapshot shape would have matched the old heuristic path
- In `runner.test.ts`, update reviewer-system-prompt expectations from `audit hints` wording to `mandatory review instructions` wording.

## Verification
- Run the focused RED suite and confirm it fails for the intended reasons before implementation:
  - `RTK_DISABLED=1 pnpm vitest run packages/supi-review/__tests__/unit/brief-runner.test.ts packages/supi-review/__tests__/unit/packet.test.ts packages/supi-review/__tests__/unit/runner.test.ts -v`
- Expected result: failing assertions about the missing brief field, missing packet section behavior, and stale prompt wording.

## TDD status
Test-driven. This task is complete only after the failures are observed and captured as the reason for the next implementation task.
