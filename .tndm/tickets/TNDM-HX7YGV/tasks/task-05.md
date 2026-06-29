# Task 5: Final verification: full package checks and workflow smoke test for code_impact

## Goal

Verify the full `supi-code-intelligence` package after the `code_impact` activation is complete.

## Files

- No product-code changes are intended in this task.

## Change to make

1. Run the full package test suite.
2. Run package typecheck and Biome.
3. Perform one manual smoke test in PI:
   - resolve a symbol with `code_resolve`
   - run `code_impact` with the returned `targetId`
   - run `code_affected` with the same `targetId`
   - confirm both produce impact output and that the preferred guidance points to `code_impact`

## Verification

```bash
RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/ --reporter=verbose
RTK_DISABLED=1 pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json packages/supi-code-intelligence/__tests__/tsconfig.json
RTK_DISABLED=1 pnpm exec biome check packages/supi-code-intelligence
```

Expected result: all commands pass. The manual PI smoke test should show `code_impact` working end-to-end from a resolved `targetId`, with `code_affected` still functioning as the compatibility path.

## TDD status

Test-exempt. Rationale: this is the explicit end-to-end verification gate, not a code-writing task.
