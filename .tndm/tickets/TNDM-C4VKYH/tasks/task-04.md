# Task 4: GREEN: implement deterministic audit hints and thread them into the reviewer packet

## Goal
Implement the deterministic audit-hint layer and ensure the reviewer sees those hints through the existing compact packet flow without adding a second reviewer pass.

## Files
- `packages/supi-review/src/target/audit-hints.ts`
- `packages/supi-review/src/target/packet.ts`
- `packages/supi-review/src/tool/review-runner.ts`

## Changes
1. Add `packages/supi-review/src/target/audit-hints.ts`.
   - Derive audit hints from the resolved snapshot shape and diff metadata.
   - Keep the logic deterministic and bounded; do not call another model.
   - Produce only the approved audit families: public-surface, cross-layer, enum/schema widening, cleanup/orphan.
2. Update `packages/supi-review/src/target/packet.ts` so the compact review packet includes a short audit-hints section that the reviewer can treat as explicit required sweeps.
3. Update `packages/supi-review/src/tool/review-runner.ts` so the reviewer system prompt explains how to use the supplied audit hints and treats them as mandatory review checks for the run.
4. Keep the existing compact packet model and on-demand snapshot inspection tools intact.
   - Do not reintroduce large inline diffs.
   - Do not add a second full reviewer pass.

## Verification
Re-run the RED tests from Task 3 and confirm they now pass:

```bash
RTK_DISABLED=1 pnpm vitest run \
  packages/supi-review/__tests__/unit/audit-hints.test.ts \
  packages/supi-review/__tests__/unit/packet.test.ts \
  packages/supi-review/__tests__/unit/runner.test.ts -v
```

Expected result: audit-hint tests pass and the reviewer packet/prompt reflect the deterministic audits.

## TDD status
GREEN task — implement only what is needed to satisfy the failing audit-hint tests, then keep the packet/prompt wording compact and explicit.
