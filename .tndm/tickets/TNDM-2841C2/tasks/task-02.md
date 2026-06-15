# Task 2: GREEN: enforce the strict code_find matrix and aligned registered metadata

## Goal
Implement the approved strict `code_find` contract and make the registered metadata advertise the same supported combinations.

## Files
- `packages/supi-code-intelligence/src/tool/execute-find.ts`
- `packages/supi-code-intelligence/src/tool/tool-specs.ts`
- `packages/supi-code-intelligence/src/workflow/schemas.ts`

## Change
In `packages/supi-code-intelligence/src/tool/execute-find.ts`:
- validate `mode`/`kind` combinations up front
- throw for every unsupported combination
- throw when explicit `mode: "semantic"` lacks a semantic/LSP provider
- remove semantic-to-text fallback
- require explicit `kind` for `mode: "ast"`
- support only AST `definition`, `import`, and `export`
- throw for AST `call`, `type`, and `test`
- throw when explicit AST mode lacks structural support
- keep successful no-results responses only for valid executed searches

In `packages/supi-code-intelligence/src/tool/tool-specs.ts`:
- rewrite the `code_find` description and `basePromptGuidelines` so they explicitly name `code_find`, follow `docs/pi/tool-guidance.md`, and state the strict matrix without mentioning ignored kinds or silent fallbacks

In `packages/supi-code-intelligence/src/workflow/schemas.ts`:
- tighten the `code_find` `mode` and `kind` parameter descriptions so the registered schema text matches the implemented combinations

## Verification
Re-run the targeted tests from task 1:
`RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/__tests__/unit/code-find-tool.test.ts packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts -v`

Expected result: Vitest exits zero and the strict runtime + registered metadata contract tests pass.
