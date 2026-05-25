# Task 5: Add code_refactor with direct-apply safety gates and precise semantic workspace edits

## Goal
Introduce `code_refactor` as a first-class intent tool that can directly apply semantic refactors only when the planner has a precise, unambiguous workspace edit plan.

## Files
- Modify `packages/supi-code-intelligence/src/tool/tool-specs.ts`
- Modify `packages/supi-code-intelligence/src/tool/register-tools.ts`
- Modify `packages/supi-code-intelligence/src/tool/guidance.ts`
- Add `packages/supi-code-intelligence/src/tool/execute-refactor.ts`
- Modify `packages/supi-code-intelligence/src/intent/types.ts` and `packages/supi-code-intelligence/src/planner/planner.ts` as needed
- Add `packages/supi-code-intelligence/src/refactor/apply-workspace-edit.ts`
- Add `packages/supi-code-intelligence/src/refactor/safety.ts`
- Add `packages/supi-code-intelligence/src/presentation/markdown/refactor.ts`
- Add tests:
  - `packages/supi-code-intelligence/__tests__/unit/refactor-tool.test.ts`
  - `packages/supi-code-intelligence/__tests__/unit/refactor-safety.test.ts`
- Modify tests if needed:
  - `packages/supi-code-intelligence/__tests__/unit/tool-adapters.test.ts`
  - `packages/supi-code-intelligence/__tests__/unit/planner-routing.test.ts`

## Change
Follow TDD.

### RED
1. Add failing tests in `packages/supi-code-intelligence/__tests__/unit/refactor-tool.test.ts` for:
   - a successful rename/code-action path that receives a precise workspace edit from the semantic provider and applies it
   - an ambiguous target path that refuses to apply and returns explicit disambiguation
   - a no-semantic-edit path that refuses to fall back to grep/text edits
2. Add failing safety tests in `packages/supi-code-intelligence/__tests__/unit/refactor-safety.test.ts` for the guardrails:
   - no apply when the provider result is not the precise/safe variant defined in Task 1
   - no apply when the edit set is empty or out of declared bounds
   - deterministic file write ordering for multi-file edits
3. Update planner/tool adapter tests only where they need to assert the new `code_refactor` contract.
4. Run:
   - `RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/__tests__/unit/refactor-tool.test.ts packages/supi-code-intelligence/__tests__/unit/refactor-safety.test.ts packages/supi-code-intelligence/__tests__/unit/tool-adapters.test.ts packages/supi-code-intelligence/__tests__/unit/planner-routing.test.ts -v`
   Confirm the failures are specifically about the missing refactor strategy/apply path.

### GREEN
5. Implement the `code_refactor` planner/tool path in the files listed above.
6. Use the optional semantic refactor capability published by Task 2; do not introduce heuristic write/edit fallbacks.
7. Implement `packages/supi-code-intelligence/src/refactor/apply-workspace-edit.ts` so direct apply is explicit, deterministic, and limited to the precise workspace edit returned by the semantic provider.
8. Implement `packages/supi-code-intelligence/src/refactor/safety.ts` so ambiguity, empty edit sets, and out-of-bounds edits fail closed.
9. Render applied/unavailable/disambiguation outcomes clearly through `packages/supi-code-intelligence/src/presentation/markdown/refactor.ts`.

### REFACTOR
10. Keep the planner small: refactor shared decision logic into helpers if needed, but do not turn `planner.ts` into a god-object.

## Verification
Run all of the following:
- `RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/__tests__/unit/refactor-tool.test.ts packages/supi-code-intelligence/__tests__/unit/refactor-safety.test.ts packages/supi-code-intelligence/__tests__/unit/tool-adapters.test.ts packages/supi-code-intelligence/__tests__/unit/planner-routing.test.ts -v`
- `pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json packages/supi-code-intelligence/__tests__/tsconfig.json`
- `pnpm exec biome check packages/supi-code-intelligence`

## Test status
Test-driven.
