# Task 3: [TDD RED] Define reference, call, implementation, and affected-analysis behavior

## Goal

Write failing behavior tests for the corrected relation semantics before service implementation.

## Files

- `packages/supi-code-intelligence/__tests__/unit/references-tool.test.ts` or existing focused equivalent
- `packages/supi-code-intelligence/__tests__/unit/calls-tool.test.ts` or existing focused equivalent
- `packages/supi-code-intelligence/__tests__/unit/implementations-tool.test.ts` or existing focused equivalent
- `packages/supi-code-intelligence/__tests__/unit/semantic-references.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/callees-action.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/details-metadata.test.ts`
- `packages/supi-code-intelligence/__tests__/integration/fallback-chain.test.ts`
- `packages/supi-code-intelligence/__tests__/helpers/register-mock-runtime.ts`
- `packages/supi-code-intelligence/__tests__/helpers/execute-action.ts` if retained for migration coverage

## Changes

- Add or update tests proving `code_references`:
  - resolves anchored and symbol targets;
  - reports references/usages, not callers;
  - groups project references by file;
  - counts external references separately;
  - returns unavailable without semantic capability;
  - does not fall back to text search.
- Add or update tests proving `code_calls`:
  - requires `file`, `line`, and `character`;
  - uses structural outgoing callee data;
  - labels results as outgoing calls;
  - returns unavailable without structural capability.
- Add or update tests proving `code_implementations`:
  - uses semantic implementation lookup;
  - handles no implementations and unavailable semantic capability;
  - does not fall back to text search.
- Add tests proving `code_affected` shares reference evidence semantics with `code_references` rather than its own divergent reference path.

## Verification

Run and confirm failures are behavioral failures from missing new services/renderers or old wording:

```bash
RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/__tests__/unit/references-tool.test.ts packages/supi-code-intelligence/__tests__/unit/calls-tool.test.ts packages/supi-code-intelligence/__tests__/unit/implementations-tool.test.ts packages/supi-code-intelligence/__tests__/unit/semantic-references.test.ts packages/supi-code-intelligence/__tests__/unit/callees-action.test.ts packages/supi-code-intelligence/__tests__/integration/fallback-chain.test.ts -v
```

If new test files are not created because existing files are a better fit, run the exact updated files instead and record the failing assertions in the task notes during apply.

## TDD status

RED task. Do not change implementation files in this task.
