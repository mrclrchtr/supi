# Task 3: RED: specify diff-aware code_impact inputs and honest unavailable outcomes

## Goal

Lock the second-wave `code_impact` behavior in tests before adding diff-aware implementation logic.

## Files

- `packages/supi-code-intelligence/__tests__/unit/code-impact-tool.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/details-metadata.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/code-resolve-tool.test.ts`

## Change to make

1. Extend `packages/supi-code-intelligence/__tests__/unit/code-impact-tool.test.ts` with coverage for `changedFiles`, optional `baseRef`, and `includeTests`.
2. Add an explicit test for `code_impact({ change: "..." })` with no `targetId` or `changedFiles`; the expected result must be an honest unavailable/insufficient-evidence response, not heuristic guessing.
3. Extend `packages/supi-code-intelligence/__tests__/unit/details-metadata.test.ts` so structured details for `code_impact` cover the new entry paths and next-query guidance.
4. If `code_resolve` or impact markdown emits follow-up suggestions that differ by entry path, pin that behavior in `packages/supi-code-intelligence/__tests__/unit/code-resolve-tool.test.ts`.
5. Keep the compatibility boundary clear: `code_impact` gets the wider schema; `code_affected` keeps the narrower target-based surface unless a test explicitly proves otherwise.

## Verification

Run the focused tests before implementing the new logic:

```bash
RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/__tests__/unit/code-impact-tool.test.ts packages/supi-code-intelligence/__tests__/unit/details-metadata.test.ts packages/supi-code-intelligence/__tests__/unit/code-resolve-tool.test.ts -v
```

Expected result: the new assertions fail because diff-aware `code_impact` behavior is not implemented yet, while the already-completed target-based behavior remains green.

## TDD status

Test-driven. This is the RED step for diff-aware impact behavior.
