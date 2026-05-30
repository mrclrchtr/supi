# Task 2: GREEN: implement brief-selected review instruction blocks and remove snapshot heuristics

## Goal
Implement the new data flow so the brief selects review instruction blocks from a fixed catalog and the host only renders the selected blocks.

## Files
- `packages/supi-review/src/types.ts`
- `packages/supi-review/src/tool/schemas.ts`
- `packages/supi-review/src/history/synthesize.ts`
- `packages/supi-review/src/tool/brief-runner.ts`
- `packages/supi-review/src/target/packet.ts`
- `packages/supi-review/src/tool/review-runner.ts`
- `packages/supi-review/src/target/review-instruction-blocks.ts` (new)
- `packages/supi-review/src/target/audit-hints.ts` (remove or replace)

## Change to make
- Add a shared instruction-block ID type and extend `SynthesizedReviewBrief` with `reviewInstructionBlockIds`.
- Extend `reviewBriefSchema` so the brief tool validates the new field.
- Create `packages/supi-review/src/target/review-instruction-blocks.ts` as the fixed catalog for the current four instruction families, exporting stable IDs plus host-owned title/instruction text.
- Update `buildBriefSynthesisPrompt()` to list the allowed block IDs/titles and instruct the brief synthesizer to return only supported IDs, preferring omission over guessing.
- Keep `runBriefSynthesis()`/`brief-runner.ts` behavior unchanged apart from accepting and returning the expanded brief payload.
- Update `buildReviewPacket()` to resolve the brief-selected IDs against the catalog and render a `## Mandatory review instructions` section only when IDs are present.
- Remove the snapshot/diff-string derivation path from packet building so packet construction no longer depends on host-side heuristic selection.
- Update `buildReviewerSystemPrompt()` to use the new terminology and contract.
- Delete or fully repurpose `packages/supi-review/src/target/audit-hints.ts` so no dead heuristic-selection code remains.

## Verification
- Re-run the focused suite and make it pass:
  - `RTK_DISABLED=1 pnpm vitest run packages/supi-review/__tests__/unit/brief-runner.test.ts packages/supi-review/__tests__/unit/packet.test.ts packages/supi-review/__tests__/unit/runner.test.ts -v`
- Run package typecheck for the touched package and tests:
  - `pnpm exec tsc -b packages/supi-review/tsconfig.json packages/supi-review/__tests__/tsconfig.json`
- Expected result: focused tests pass, types are clean, and no code path derives instruction blocks directly from snapshot heuristics.

## TDD status
GREEN phase for the failing tests from Task 1.
