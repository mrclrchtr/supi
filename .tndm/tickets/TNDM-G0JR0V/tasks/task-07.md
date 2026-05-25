# Task 7: Fix post-verification gaps in refactor safety, path resolution, planner usage, and compatibility tests

## Goal
Address the issues found during fresh verification after Tasks 1–6: remove the obsolete e2e smoke assertions, make workspace-edit apply behavior safer and Biome-clean, resolve refactor file paths against `ctx.cwd`, add missing `code_refactor` execution coverage, and route `code_affected` through the planner.

## Files
- Modify `packages/supi-code-intelligence/src/refactor/apply-workspace-edit.ts`
- Modify `packages/supi-code-intelligence/src/refactor/safety.ts`
- Modify `packages/supi-code-intelligence/src/tool/execute-refactor.ts`
- Modify `packages/supi-code-intelligence/src/tool/execute-affected.ts`
- Modify `packages/supi-code-intelligence/__tests__/unit/apply-workspace-edit.test.ts`
- Modify `packages/supi-code-intelligence/__tests__/unit/refactor-safety.test.ts`
- Modify `packages/supi-code-intelligence/__tests__/unit/refactor-tool.test.ts`
- Modify `packages/supi-code-intelligence/__tests__/unit/planner-routing.test.ts`
- Remove or simplify obsolete assertions in `packages/supi-lsp/__tests__/integration/e2e-smoke.test.ts`

## Change
Follow TDD for the testable code changes.

### RED
1. Extend `packages/supi-code-intelligence/__tests__/unit/apply-workspace-edit.test.ts` with failing cases that prove:
   - multi-file apply does not partially commit when a later write fails
   - character positions beyond the actual line length are rejected instead of silently appending
2. Extend `packages/supi-code-intelligence/__tests__/unit/refactor-tool.test.ts` with failing execution tests for:
   - relative `file` input resolving against `ctx.cwd`
   - ambiguous provider results refusing to apply
   - unavailable provider results refusing to apply
   - a successful precise rename path applying edits
3. Extend `packages/supi-code-intelligence/__tests__/unit/planner-routing.test.ts` with a failing case that proves `code_affected` uses planner routing / semantic availability correctly.
4. Run:
   - `RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/__tests__/unit/apply-workspace-edit.test.ts packages/supi-code-intelligence/__tests__/unit/refactor-safety.test.ts packages/supi-code-intelligence/__tests__/unit/refactor-tool.test.ts packages/supi-code-intelligence/__tests__/unit/planner-routing.test.ts -v`
   Confirm the failures match the missing safety/path/planner behavior.

### GREEN
5. Refactor `packages/supi-code-intelligence/src/refactor/apply-workspace-edit.ts` to reduce cognitive complexity and make the apply path safer. Keep the existing two-phase precompute model, but ensure invalid character bounds are rejected and avoid partial commits on write failure.
6. Update `packages/supi-code-intelligence/src/refactor/safety.ts` so out-of-bounds character positions fail closed.
7. Update `packages/supi-code-intelligence/src/tool/execute-refactor.ts` so `file` is normalized relative to `ctx.cwd` before invoking the semantic provider.
8. Update `packages/supi-code-intelligence/src/tool/execute-affected.ts` so it consults the planner and reports unavailable semantic-provider state consistently.
9. Remove the obsolete tool-count/sorted-name assertions from `packages/supi-lsp/__tests__/integration/e2e-smoke.test.ts` per user direction, while keeping any remaining coverage meaningful.

### REFACTOR
10. Keep helper extraction focused on reducing complexity and improving testability; avoid unrelated architectural churn.

## Verification
Run all of the following fresh:
- `RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/__tests__/unit/apply-workspace-edit.test.ts packages/supi-code-intelligence/__tests__/unit/refactor-safety.test.ts packages/supi-code-intelligence/__tests__/unit/refactor-tool.test.ts packages/supi-code-intelligence/__tests__/unit/planner-routing.test.ts -v`
- `RTK_DISABLED=1 pnpm vitest run packages/supi-lsp/__tests__/integration/e2e-smoke.test.ts -v`
- `pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json packages/supi-code-intelligence/__tests__/tsconfig.json packages/supi-lsp/tsconfig.json packages/supi-lsp/__tests__/tsconfig.json`
- `pnpm exec biome check packages/supi-code-intelligence packages/supi-lsp`

## Test status
Test-driven for code changes; smoke-test cleanup is verified by the fresh vitest run above.
