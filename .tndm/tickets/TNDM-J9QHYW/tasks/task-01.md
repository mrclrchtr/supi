# Task 1: [TDD RED] Lock the new public code tool surface and capability routing

## Goal

Write failing tests that define the public clean-break surface before implementation changes.

## Files

- `packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/planner-routing.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/tool-adapters.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/details-metadata.test.ts`
- `packages/supi-code-intelligence/__tests__/helpers/execute-action.ts` if the legacy action shim must be kept aligned for existing tests

## Changes

- Assert that `code_references`, `code_calls`, `code_implementations`, `code_refactor_plan`, and `code_refactor_apply` are registered.
- Assert that `code_relations` and `code_refactor` are no longer registered in the high-level `code_*` surface.
- Assert routing/capability expectations:
  - `code_references` and `code_implementations` require semantic capability.
  - `code_calls` requires structural capability.
  - `code_refactor_plan` requires a refactor-capable semantic provider.
  - `code_refactor_apply` validates a plan id rather than provider capability first.
- Assert structured details metadata exists for new tool families where relevant.

## Verification

Run and confirm these tests fail for missing new tools or old routing behavior, not for setup errors:

```bash
RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts packages/supi-code-intelligence/__tests__/unit/planner-routing.test.ts packages/supi-code-intelligence/__tests__/unit/tool-adapters.test.ts packages/supi-code-intelligence/__tests__/unit/details-metadata.test.ts -v
```

## TDD status

RED task. Do not change implementation files in this task.
