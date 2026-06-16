# Task 1: Lock noisy test-name regressions and clean graph/context test listings

## Goal
Prevent `code_graph` and `code_context` from surfacing low-signal fallback names such as `tmpDir`, `writeSource`, and repeated `result` in user-facing test listings.

## Files
- `packages/supi-code-intelligence/__tests__/unit/analysis/relations-tests.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/tool/execute-graph.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/code-context-tool.test.ts`
- `packages/supi-code-intelligence/src/analysis/relations/tests.ts`
- `packages/supi-code-intelligence/src/tool/execute-graph.ts`
- `packages/supi-code-intelligence/src/use-case/generate-context.ts`

## Change
- Follow RED → GREEN for this concern.
- First, tighten the existing regression tests so they prove the desired user-facing behavior:
  - recognized `describe` / `it` / `test` / `spec` names still render when available
  - fallback helper names never appear in `code_graph` or `code_context` markdown output
  - discovered test files with no recognized blocks render `_(no recognized test blocks)_`
- Run the focused tests and confirm they fail for the current fallback-name behavior.
- Then implement the minimal runtime change so user-facing rendering only prints recognized test block names; discovery may still inspect outline data internally, but helper/variable fallback names must not be emitted in markdown output.

## Verification
- Run:
  - `RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/__tests__/unit/analysis/relations-tests.test.ts packages/supi-code-intelligence/__tests__/unit/tool/execute-graph.test.ts packages/supi-code-intelligence/__tests__/unit/code-context-tool.test.ts --reporter=verbose`
- Expected result:
  - the updated tests fail before the runtime change for the correct noisy-name assertions
  - after the runtime change, the same command passes and rendered output contains `_(no recognized test blocks)_` instead of helper names

## Test strategy
Test-driven.
