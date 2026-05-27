# Task 6: [TDD GREEN] Implement refactor planning, stale-plan checks, and explicit apply

## Goal

Implement preview-first semantic rename and explicit plan application so the Task 5 tests pass.

## Files

- `packages/supi-code-intelligence/src/tool/execute-refactor-plan.ts`
- `packages/supi-code-intelligence/src/tool/execute-refactor-apply.ts`
- `packages/supi-code-intelligence/src/tool/execute-refactor.ts` if it is removed or kept as a non-public helper during migration
- `packages/supi-code-intelligence/src/analysis/refactor/service.ts`
- `packages/supi-code-intelligence/src/analysis/refactor/plan-store.ts`
- `packages/supi-code-intelligence/src/analysis/refactor/apply-workspace-edit.ts`
- `packages/supi-code-intelligence/src/analysis/refactor/safety.ts`
- `packages/supi-code-intelligence/src/refactor/apply-workspace-edit.ts`
- `packages/supi-code-intelligence/src/refactor/safety.ts`
- `packages/supi-code-intelligence/src/presentation/markdown/refactor.ts`
- `packages/supi-code-intelligence/src/tool/tool-specs.ts`
- `packages/supi-code-intelligence/src/tool/register-tools.ts`
- `packages/supi-code-intelligence/src/types.ts`

## Changes

- Implement `code_refactor_plan` as preview-only:
  - route through refactor-capable semantic provider;
  - call rename with 0-based LSP coordinates;
  - validate the edit;
  - compute stable plan id;
  - compute per-file fingerprints from current contents;
  - return structured plan details and markdown preview;
  - do not write files.
- Implement `code_refactor_apply`:
  - accept `planId`;
  - find matching `code_refactor_plan` details in the current session branch;
  - recheck fingerprints before apply;
  - re-run range and overlap validation;
  - apply deterministically;
  - use pi file mutation queue where the current extension API allows it, or wrap the existing per-file apply path with queued access in sorted file order;
  - report stale, missing, unsafe, and successful states clearly.
- Keep `lsp_rename` as an expert planning/debug tool, but high-level mutation happens only through the new plan/apply pair.

## Verification

Run the refactor tests from Task 5 and confirm they pass:

```bash
RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/__tests__/unit/refactor-tool.test.ts packages/supi-code-intelligence/__tests__/unit/refactor-plan-apply.test.ts packages/supi-code-intelligence/__tests__/unit/refactor-safety.test.ts packages/supi-code-intelligence/__tests__/unit/apply-workspace-edit.test.ts packages/supi-code-intelligence/__tests__/unit/details-metadata.test.ts -v
```

Run typecheck after changing apply signatures or details types:

```bash
RTK_DISABLED=1 pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json packages/supi-code-intelligence/__tests__/tsconfig.json
```

## TDD status

GREEN task for Task 5.
