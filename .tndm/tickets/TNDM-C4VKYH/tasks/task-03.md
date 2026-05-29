# Task 3: RED: lock deterministic audit-hint triggers and packet/prompt integration

## Goal
Write failing tests for the new deterministic audit-hint layer before implementing it. The tests should prove that snapshot shape drives audit hints and that those hints appear in the compact reviewer packet / reviewer prompt.

## Files
- `packages/supi-review/__tests__/unit/audit-hints.test.ts`
- `packages/supi-review/__tests__/unit/packet.test.ts`
- `packages/supi-review/__tests__/unit/runner.test.ts`

## Changes
1. Add `packages/supi-review/__tests__/unit/audit-hints.test.ts` covering deterministic trigger rules for:
   - public-surface / rename / merge audit
   - cross-layer propagation audit
   - enum / operation / schema widening audit
   - cleanup / deletion / orphan audit
2. Update `packages/supi-review/__tests__/unit/packet.test.ts` so the review packet is expected to include a concise audit-hints section alongside the existing compact manifest/overview.
3. Extend `packages/supi-review/__tests__/unit/runner.test.ts` so the reviewer system prompt is expected to reference the audit hints supplied in the prompt packet and treat them as mandatory checks for the run.

## Verification
Run the audit-related tests and confirm they fail for the expected missing audit-hint behavior:

```bash
RTK_DISABLED=1 pnpm vitest run \
  packages/supi-review/__tests__/unit/audit-hints.test.ts \
  packages/supi-review/__tests__/unit/packet.test.ts \
  packages/supi-review/__tests__/unit/runner.test.ts -v
```

Expected result: failures that point to absent deterministic audit-hint derivation / packet integration, not broken test setup.

## TDD status
TDD task — watch the tests fail before implementing audit-hint logic.
