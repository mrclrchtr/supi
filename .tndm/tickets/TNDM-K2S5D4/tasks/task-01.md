# Task 1: Add failing regressions for shared test-analysis parity and provenance

## Goal
Prove the current inconsistency and lock the intended contract in tests before changing implementation.

## Files
- `packages/supi-code-intelligence/__tests__/unit/analysis/relations-tests.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/tool/execute-graph.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/code-context-tool.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/code-impact-tool.test.ts`

## Change
Add failing regression coverage for the approved shared contract:

1. The same source target yields the same discovered companion test file set in `code_graph` and `code_context` under the same provider state.
2. Target-based `code_impact` uses the same companion-test discovery contract for file selection.
3. Provenance assertions treat provenance as **discovery evidence only**, not label-extraction evidence.
4. `changedFiles` impact remains structural-only and renders `conventions-only` evidence when appropriate.
5. Discovered test files with no recognized test labels render the explicit placeholder rather than helper-symbol noise.
6. Non-mirror test naming discovered via semantic references is covered by at least one regression.

Use the existing temp-workspace test helpers and mock provider registration patterns already used by the package tests.

## Verification
### RED
Run the focused regression suite and confirm the new assertions fail for the current behavior, specifically on the cross-tool parity and provenance cases:

```bash
RTK_DISABLED=1 pnpm vitest run \
  packages/supi-code-intelligence/__tests__/unit/analysis/relations-tests.test.ts \
  packages/supi-code-intelligence/__tests__/unit/tool/execute-graph.test.ts \
  packages/supi-code-intelligence/__tests__/unit/code-context-tool.test.ts \
  packages/supi-code-intelligence/__tests__/unit/code-impact-tool.test.ts \
  --reporter=verbose
```

Expected result for this task: the new tests fail for the intended contract mismatch, not for unrelated setup errors.

## Test mode
Test-driven (RED task).
