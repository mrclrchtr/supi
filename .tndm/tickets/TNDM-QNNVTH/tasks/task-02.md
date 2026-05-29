# Task 2: [TDD GREEN] Refine target registration and targetId-based graph follow-ups

## Goal
Make `code_resolve` register the most useful follow-up anchor it can justify, and make downstream `targetId` consumers preserve stored identity data.

## Files
- `packages/supi-code-intelligence/src/targeting/resolve-symbol.ts`
- `packages/supi-code-intelligence/src/analysis/resolve/service.ts`
- `packages/supi-code-intelligence/src/tool/target-id-params.ts`
- `packages/supi-code-intelligence/src/tool/execute-graph.ts`
- `packages/supi-code-intelligence/__tests__/unit/code-resolve-tool.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/workflow-target-store.test.ts`

## Change
Implement the minimal production changes needed to make Task 1 pass:
- refine symbol-resolution output so stored targets prefer the strongest justified follow-up anchor available from semantic symbol data
- keep stored `name` / `kind` metadata available through `targetId` expansion instead of discarding it during follow-up calls
- use that stored identity when rendering graph output so known symbols are labeled by name rather than anonymous fallback text
- keep stale/unknown `targetId` behavior explicit and unchanged
- do not invent precision when semantic symbol data does not provide a stronger anchor

## Verification
Re-run the Task 1 test command and confirm it passes, then run the graph executor coverage to catch relation-rendering regressions:

```bash
RTK_DISABLED=1 pnpm vitest run \
  packages/supi-code-intelligence/__tests__/unit/code-resolve-tool.test.ts \
  packages/supi-code-intelligence/__tests__/unit/workflow-target-store.test.ts \
  packages/supi-code-intelligence/__tests__/unit/tool/execute-graph.test.ts
```

Expected result: all targeted tests pass.

## Test mode
Test-driven (GREEN). Only make the production changes required to satisfy the RED coverage.
