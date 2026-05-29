# Task 3: [TDD GREEN] Generalize code_refactor_plan/apply to multi-operation text-edit plans

# Task 3: [TDD GREEN] Generalize code_refactor_plan/apply to multi-operation text-edit plans

## Goal

Extend the current public refactor tools from rename-only logic to operation-aware text-edit plans while keeping the public tool names unchanged.

## Files

- `packages/supi-code-intelligence/src/tool/tool-specs.ts`
- `packages/supi-code-intelligence/src/tool/execute-refactor-plan.ts`
- `packages/supi-code-intelligence/src/tool/execute-refactor-apply.ts`
- `packages/supi-code-intelligence/src/analysis/refactor/plan-store.ts`
- `packages/supi-code-intelligence/src/analysis/refactor/safety.ts`
- `packages/supi-code-intelligence/src/analysis/refactor/apply-workspace-edit.ts`
- `packages/supi-code-intelligence/src/presentation/markdown/refactor.ts`
- `packages/supi-code-intelligence/__tests__/unit/refactor-plan-apply.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/refactor-safety.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/code-resolve-tool.test.ts` (if targetId follow-up assertions need the new operation naming)

## Changes

1. Widen the public `operation` schema beyond rename-only and add any needed optional parameters for future-safe validation, while keeping the public tools named `code_refactor_plan` and `code_refactor_apply`.
2. Canonicalize legacy `operation: "rename"` to `rename_symbol` internally so current callers keep working.
3. Replace rename-specific plan metadata/rendering with generic operation-aware summaries.
4. Keep apply planId-based, fingerprint-checked, and text-edit only in this ticket.
5. Return explicit unavailable for `rename_file` and `move_file` instead of partially implementing resource/file mutations.
6. Preserve the current safety guarantees: empty-edit rejection, overlap rejection, bounds checks, and stale-plan detection.

## Verification

```bash
RTK_DISABLED=1 pnpm vitest run \
  packages/supi-code-intelligence/__tests__/unit/refactor-plan-apply.test.ts \
  packages/supi-code-intelligence/__tests__/unit/refactor-safety.test.ts \
  packages/supi-code-intelligence/__tests__/unit/code-resolve-tool.test.ts -v
pnpm exec tsc -b \
  packages/supi-code-intelligence/tsconfig.json \
  packages/supi-code-intelligence/__tests__/tsconfig.json
```

Expected result: the refactor tests pass and the package typechecks with the generalized first-wave operation set.

