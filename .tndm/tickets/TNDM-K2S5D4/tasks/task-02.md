# Task 2: Implement a shared test-analysis contract for code_graph, code_context, and code_impact

## Goal
Replace per-surface drift with one normalized internal test-analysis result that all three public surfaces consume.

## Files
- `packages/supi-code-intelligence/src/analysis/relations/tests.ts`
- `packages/supi-code-intelligence/src/tool/execute-graph.ts`
- `packages/supi-code-intelligence/src/use-case/generate-context.ts`
- `packages/supi-code-intelligence/src/use-case/generate-impact.ts`
- `packages/supi-code-intelligence/src/presentation/markdown/impact.ts`

## Change
Implement the shared contract in `src/analysis/relations/tests.ts` and route all test-related consumers through it.

The shared result must include, at minimum:
- discovered test files
- discovery provenance (`semantic+conventions` or `conventions-only`)
- a separate extraction-status signal
- a normalized empty/unavailable reason

Required implementation rules:
1. `code_graph` and `code_context` must pass the same source-target inputs, including anchored position when semantic references need it.
2. `code_graph` and `code_context` must agree on discovered test files for the same target and provider state.
3. `code_impact` target-based likely-tests output must use the same shared discovery contract for file selection.
4. `code_impact` `changedFiles` mode must remain structural-only; do not add semantic dependency there.
5. Discovery provenance must describe file discovery only, never test-label extraction.
6. Empty-state and unavailable-state rendering should be derived from the shared result instead of duplicated local rules.

Keep the public tool names and input parameters unchanged.

## Verification
### GREEN
Re-run the focused regression suite from task 1 and confirm it passes:

```bash
RTK_DISABLED=1 pnpm vitest run \
  packages/supi-code-intelligence/__tests__/unit/analysis/relations-tests.test.ts \
  packages/supi-code-intelligence/__tests__/unit/tool/execute-graph.test.ts \
  packages/supi-code-intelligence/__tests__/unit/code-context-tool.test.ts \
  packages/supi-code-intelligence/__tests__/unit/code-impact-tool.test.ts \
  --reporter=verbose
```

Expected result for this task: the new parity/provenance regressions pass without breaking existing assertions in the same files.

## Test mode
Test-driven (GREEN after task 1 RED).
