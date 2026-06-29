# Task 1: RED: codify the strict code_find runtime and metadata contract

## Goal
Write failing tests that lock the approved `code_find` matrix before changing implementation.

## Files
- `packages/supi-code-intelligence/__tests__/unit/code-find-tool.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts`

## Change
Add or rewrite tests so the current implementation fails for the right reasons:
- `kind` with omitted `mode` fails
- `mode: "text"` + `kind` fails
- `mode: "regex"` + `kind` fails
- `mode: "semantic"` + `kind` fails
- `mode: "semantic"` with no provider fails as a real thrown tool error
- `mode: "semantic"` with a provider and zero matches succeeds with a no-results result
- `mode: "semantic"` with a provider and matches succeeds
- `mode: "ast"` without `kind` fails
- `mode: "ast"` with `call`, `type`, or `test` fails
- `mode: "ast"` with no structural provider fails as a real thrown tool error
- `packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts` asserts the registered `code_find` description, prompt guidance, and `mode`/`kind` parameter descriptions advertise the strict matrix instead of ignored kinds or silent fallback behavior

Use thrown-error assertions for true failures rather than checking returned `"Error"` strings.

## Verification
Run the targeted tests and confirm they fail against the current implementation:
`RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/__tests__/unit/code-find-tool.test.ts packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts -v`

Expected result: Vitest exits non-zero because the new assertions reject the current fallback/soft-contract behavior.
