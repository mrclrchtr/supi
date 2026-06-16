# Task 4: Run focused regressions, full verification, and repo smoke checks

## Goal
Prove the complete trust-cleanup change works end-to-end after all implementation tasks are done.

## Files
- `packages/supi-code-intelligence/__tests__/unit/analysis/relations-tests.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/tool/execute-graph.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/code-context-tool.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/code-impact-tool.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/code-inspect-tool.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts`
- `packages/supi-code-intelligence/src/analysis/relations/tests.ts`
- `packages/supi-code-intelligence/src/tool/execute-graph.ts`
- `packages/supi-code-intelligence/src/use-case/generate-context.ts`
- `packages/supi-code-intelligence/src/use-case/generate-impact.ts`
- `packages/supi-code-intelligence/src/use-case/generate-inspect.ts`
- `packages/supi-code-intelligence/README.md`
- `packages/supi-code-intelligence/CLAUDE.md`

## Change
- No new feature work in this task.
- Run the focused regression suite for every touched trust-cleanup area.
- Run full repo verification.
- Perform a manual smoke check in this repository using the public tools to confirm the trust surface matches the plan:
  - `code_graph` on a symbol with `relations: ["tests"]` shows either recognized test block names or `_(no recognized test blocks)_`, never helper fallback names
  - `code_context` with `include: ["tests"]` shows the same cleaned behavior
  - `code_impact` with `changedFiles` still finds convention-based likely tests and includes the `**Evidence: structural**` footer

## Verification
- Run:
  - `RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/__tests__/unit/analysis/relations-tests.test.ts packages/supi-code-intelligence/__tests__/unit/tool/execute-graph.test.ts packages/supi-code-intelligence/__tests__/unit/code-context-tool.test.ts packages/supi-code-intelligence/__tests__/unit/code-impact-tool.test.ts packages/supi-code-intelligence/__tests__/unit/code-inspect-tool.test.ts packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts --reporter=verbose`
  - `RTK_DISABLED=1 pnpm verify:ai`
- Expected result:
  - focused regressions pass
  - `pnpm verify:ai` passes cleanly
  - manual smoke checks confirm the public tool output matches the tightened trust contract

## Test strategy
Verification-only task; no code changes.
