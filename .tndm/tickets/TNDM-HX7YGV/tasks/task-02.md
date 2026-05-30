# Task 2: GREEN: register code_impact and share the current target-based impact engine

## Goal

Make the RED tests pass by activating `code_impact` for target-based impact analysis while keeping `code_affected` as a compatibility alias backed by the same shared implementation.

## Files

- `packages/supi-code-intelligence/src/tool/execute-impact.ts`
- `packages/supi-code-intelligence/src/tool/execute-affected.ts`
- `packages/supi-code-intelligence/src/use-case/generate-impact.ts`
- `packages/supi-code-intelligence/src/use-case/generate-affected.ts`
- `packages/supi-code-intelligence/src/presentation/markdown/impact.ts`
- `packages/supi-code-intelligence/src/presentation/markdown/affected.ts`
- `packages/supi-code-intelligence/src/presentation/markdown/resolve.ts`
- `packages/supi-code-intelligence/src/tool/tool-specs.ts`
- `packages/supi-code-intelligence/src/analysis/routing/planner.ts`
- `packages/supi-code-intelligence/src/intent/types.ts`
- `packages/supi-code-intelligence/src/types.ts`
- `packages/supi-code-intelligence/src/tool/target-id-params.ts`
- `packages/supi-code-intelligence/src/workflow/schemas.ts`
- `packages/supi-code-intelligence/src/workflow/surface.ts`

## Change to make

1. Add `packages/supi-code-intelligence/src/tool/execute-impact.ts` as the public executor for `code_impact`.
2. Extract or wrap the existing target-based impact logic behind `packages/supi-code-intelligence/src/use-case/generate-impact.ts` and `packages/supi-code-intelligence/src/presentation/markdown/impact.ts` so both `code_impact` and `code_affected` can reuse one honest implementation path.
3. Keep `packages/supi-code-intelligence/src/tool/execute-affected.ts` and the old `affected` use-case/renderer files as compatibility wrappers or thin forwarders rather than duplicating the logic.
4. Register `code_impact` in `packages/supi-code-intelligence/src/tool/tool-specs.ts` with the existing workflow schema, prompt guidance, and executor wiring.
5. Update `packages/supi-code-intelligence/src/analysis/routing/planner.ts`, `packages/supi-code-intelligence/src/intent/types.ts`, `packages/supi-code-intelligence/src/types.ts`, and `packages/supi-code-intelligence/src/tool/target-id-params.ts` so `code_impact` is a first-class routed tool with working `targetId` expansion and structured details.
6. Update follow-up hints in `packages/supi-code-intelligence/src/presentation/markdown/resolve.ts` and the shared impact renderer so workflow guidance prefers `code_impact` while still acknowledging `code_affected` as compatibility-only.
7. Update `packages/supi-code-intelligence/src/workflow/surface.ts` to stop describing `code_impact` as inactive roadmap-only metadata.

## Verification

Re-run the RED test set and then typecheck the package:

```bash
RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/__tests__/unit/code-impact-tool.test.ts packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts packages/supi-code-intelligence/__tests__/unit/planner-routing.test.ts packages/supi-code-intelligence/__tests__/unit/code-resolve-tool.test.ts packages/supi-code-intelligence/__tests__/unit/details-metadata.test.ts -v
RTK_DISABLED=1 pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json packages/supi-code-intelligence/__tests__/tsconfig.json
```

Expected result: the targeted tests from Task 1 pass, and the package typecheck stays green.

## TDD status

Test-driven. Implement only after Task 1 fails for the right reason.
