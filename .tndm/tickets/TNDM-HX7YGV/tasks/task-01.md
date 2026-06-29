# Task 1: RED: codify code_impact registration, schema, routing, and targetId follow-up contract

## Goal

Define the missing `code_impact` public contract in tests before changing production code.

## Files

- `packages/supi-code-intelligence/__tests__/unit/code-impact-tool.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/planner-routing.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/code-resolve-tool.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/details-metadata.test.ts`

## Change to make

1. Create `packages/supi-code-intelligence/__tests__/unit/code-impact-tool.test.ts` with focused coverage for the new public tool contract.
2. Extend `packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts` to expect `code_impact` on the active public surface and to stop treating it as an inactive roadmap-only tool.
3. Extend `packages/supi-code-intelligence/__tests__/unit/planner-routing.test.ts` so `routeFor(..., "code_impact")` is semantic-preferred when semantic analysis is ready and unavailable when it is not.
4. Extend `packages/supi-code-intelligence/__tests__/unit/code-resolve-tool.test.ts` so `code_resolve` follow-up guidance prefers `code_impact` for blast-radius analysis.
5. Extend `packages/supi-code-intelligence/__tests__/unit/details-metadata.test.ts` to pin the structured details and next-query shape expected from the new workflow tool.
6. If the ticket keeps `code_affected` as a compatibility alias, pin that expectation in the relevant tests instead of silently changing the old tool away.

## Verification

Run the tests before any production-code changes:

```bash
RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/__tests__/unit/code-impact-tool.test.ts packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts packages/supi-code-intelligence/__tests__/unit/planner-routing.test.ts packages/supi-code-intelligence/__tests__/unit/code-resolve-tool.test.ts packages/supi-code-intelligence/__tests__/unit/details-metadata.test.ts -v
```

Expected result: the run fails specifically because `code_impact` is not yet registered/routed/returned in hints. Do not start implementation until the failure points at the missing behavior.

## TDD status

Test-driven. This is the RED step.
