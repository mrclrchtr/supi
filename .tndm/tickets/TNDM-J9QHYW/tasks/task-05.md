# Task 5: [TDD RED] Define two-step refactor plan/apply behavior

## Goal

Write failing tests for preview-first refactoring before changing implementation behavior.

## Files

- `packages/supi-code-intelligence/__tests__/unit/refactor-tool.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/refactor-plan-apply.test.ts` if a new focused file keeps tests clearer
- `packages/supi-code-intelligence/__tests__/unit/refactor-safety.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/apply-workspace-edit.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/details-metadata.test.ts`
- `packages/supi-code-intelligence/__tests__/helpers/register-mock-runtime.ts`
- `packages/supi-code-intelligence/__tests__/helpers/test-utils.ts` if session branch/tool-result fixtures need shared helpers

## Changes

- Add tests proving `code_refactor_plan`:
  - calls semantic rename when refactor capability is available;
  - returns a plan id and compact preview details;
  - validates the returned workspace edit;
  - records file fingerprints;
  - does not mutate files.
- Add tests proving `code_refactor_apply`:
  - requires a plan id;
  - finds the plan from session branch/tool-result state;
  - rejects missing plans;
  - rejects stale plans when file fingerprints changed;
  - applies a valid plan and reports files changed.
- Update existing direct-apply expectations so no test still expects `code_refactor` to mutate files in one call.

## Verification

Run and confirm failures are from missing plan/apply behavior, not test fixture setup:

```bash
RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/__tests__/unit/refactor-tool.test.ts packages/supi-code-intelligence/__tests__/unit/refactor-plan-apply.test.ts packages/supi-code-intelligence/__tests__/unit/refactor-safety.test.ts packages/supi-code-intelligence/__tests__/unit/apply-workspace-edit.test.ts packages/supi-code-intelligence/__tests__/unit/details-metadata.test.ts -v
```

If `refactor-plan-apply.test.ts` is not created, run the exact updated refactor test files and record the failing assertions in the task notes during apply.

## TDD status

RED task. Do not change implementation files in this task.
