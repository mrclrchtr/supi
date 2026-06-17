# Task 2: GREEN: implement TypeScript-family full-expression call-site extraction and align runtime messages

## Goal
Make the RED tests pass by returning full callee expressions for JS/TS/TSX call sites and aligning `code_find` runtime text with `call` support.

## Files
- Modify `packages/supi-tree-sitter/src/tool/call-sites.ts`
- Modify `packages/supi-code-intelligence/src/tool/execute-find.ts`

## Changes
1. In `packages/supi-tree-sitter/src/tool/call-sites.ts`:
   - Introduce a shared JS/TS/TSX query that captures the entire callee expression without arguments, for example:
     - `(call_expression function: (_) @call)`
     - `(new_expression constructor: (_) @call)`
   - Use that query for `javascript`, `typescript`, and `tsx` only.
   - Keep non-TS grammar queries unchanged.
   - Normalize captured names by trimming and collapsing internal whitespace to a single space before deduplication.
   - Keep deduplication based on normalized name plus `startLine`.
2. In `packages/supi-code-intelligence/src/tool/execute-find.ts`:
   - Update the file header comment to say AST search supports `definition`, `import`, `export`, and `call`.
   - Update validation error messages in `validateModeKindCombination()` so every supported-kind list includes `call` and every unsupported-kind message clearly states that `type` and `test` are not supported in this phase.
   - Do not change the public schema or search mode dispatch; `SUPPORTED_AST_KINDS` already includes `call` and should remain the source for validation.

## Verification
Run the focused tests from Task 1 and confirm they pass:

```bash
set -v
RTK_DISABLED=1 pnpm -s vitest run packages/supi-tree-sitter/__tests__/call-sites.test.ts packages/supi-code-intelligence/__tests__/unit/code-find-tool.test.ts --reporter=verbose
```

Expected GREEN result: all tests in those files pass.

## Test mode
Test-driven GREEN implementation. Make only the minimal implementation changes required to satisfy the RED tests, then refactor locally while keeping the focused tests green.
