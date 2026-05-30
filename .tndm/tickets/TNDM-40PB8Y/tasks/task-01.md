# Task 1: Add shared preview data helper for the review-plan inspector

## Goal
Expose structured preview data from packet-building code so the inspector can render Overview mode without parsing the raw prompt string.

## Files
- `packages/supi-review/src/target/packet.ts`
- `packages/supi-review/__tests__/unit/packet.test.ts`

## Change
- Start in `packages/supi-review/__tests__/unit/packet.test.ts` by adding failing coverage for a new shared helper exported from `packages/supi-review/src/target/packet.ts`.
- Name the helper `buildReviewPacketPreviewData` so the packet builder and inspector can share one derivation path.
- Have the helper derive the structured data needed by the inspector from a `ReviewSnapshot`: audit hints, per-file overview rows/annotations, and truncated snapshot notes when present.
- Reuse that helper inside `buildReviewPacket()` so prompt generation and Overview mode stay aligned.
- Keep `buildReviewPacket()` prompt semantics and reviewer behavior unchanged.

## Verification
1. **RED** — run:
   - `RTK_DISABLED=1 pnpm vitest run packages/supi-review/__tests__/unit/packet.test.ts`
   - Expected result: the new assertions fail because `buildReviewPacketPreviewData` does not exist yet.
2. **GREEN** — rerun the same command after implementing the helper.
   - Expected result: packet tests pass.
3. Typecheck the package and tests:
   - `pnpm exec tsc -b packages/supi-review/tsconfig.json packages/supi-review/__tests__/tsconfig.json`
   - Expected result: no type errors.

## Test strategy
TDD required.

