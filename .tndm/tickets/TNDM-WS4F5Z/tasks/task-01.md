# Task 1: [TDD RED] Lock the first-wave operation-aware refactor contract and explicit unavailable file ops

# Task 1: [TDD RED] Lock the first-wave operation-aware refactor contract and explicit unavailable file ops

## Goal

Define the desired behavior for the first-wave generalized refactor surface before changing runtime code.

## Files

- `packages/supi-lsp/__tests__/unit/refactor-provider.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/refactor-plan-apply.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/refactor-safety.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts`

## Changes

1. Add failing tests for `code_refactor_plan` with `operation: "rename_symbol"`.
2. Add failing compatibility tests proving legacy `operation: "rename"` still routes as `rename_symbol`.
3. Add failing tests for `update_imports` and `delete_dead_code` plans when the semantic provider can return precise edits.
4. Add failing tests that `rename_file` and `move_file` return explicit unavailable results — no heuristic fallback, no silent no-op, no partial filesystem mutation.
5. Add provider-layer tests locking the intended mapping:
   - `rename_symbol` → semantic rename path
   - `update_imports` / `delete_dead_code` → code-action-based path
   - imprecise or edit-less code actions are rejected
6. Update registration/schema tests so the current public tools remain `code_refactor_plan` and `code_refactor_apply`, but the refactor operation surface is wider than rename-only.

## Verification

Run the new/updated tests and confirm they fail for the expected missing behavior before implementation:

```bash
RTK_DISABLED=1 pnpm vitest run \
  packages/supi-lsp/__tests__/unit/refactor-provider.test.ts \
  packages/supi-code-intelligence/__tests__/unit/refactor-plan-apply.test.ts \
  packages/supi-code-intelligence/__tests__/unit/refactor-safety.test.ts \
  packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts -v
```

Expected result: failures mention the new operation-aware behavior that has not been implemented yet.
