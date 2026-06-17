# Task 1: RED: codify AST call support and TypeScript full-expression call-site behavior

## Goal
Add failing tests that prove `code_find(mode: "ast", kind: "call")` is supported and that TypeScript-family call-site extraction can match full callee expressions such as `params.query.trim`.

## Files
- Create `packages/supi-tree-sitter/__tests__/call-sites.test.ts`
- Modify `packages/supi-code-intelligence/__tests__/unit/code-find-tool.test.ts`

## Changes
1. In `packages/supi-tree-sitter/__tests__/call-sites.test.ts`, add integration-like tests using `createTreeSitterSession(tmpDir)` against real temporary `.ts`, `.tsx`, and `.js` fixture files.
   - At minimum, the `.ts` fixture must include calls for:
     - `params.query.trim()` → expected `params.query.trim`
     - `obj.method()` → expected `obj.method`
     - `new Thing()` → expected `Thing`
     - `factory()()` → expected `factory()` for the outer call
     - tagged template `tagged\`x\`` → expected `tagged`
   - Assert the result is `kind: "success"` and `result.data.map((entry) => entry.name)` contains those names.
2. In `packages/supi-code-intelligence/__tests__/unit/code-find-tool.test.ts`:
   - Remove `"call"` from the unsupported AST kind parameterized test; keep `"type"` and `"test"` unsupported.
   - Add a focused test for `code_find` with `mode: "ast", kind: "call"` and a mocked structural provider whose `callSites` returns a known call entry.
   - Add an integration-like test that registers a real Tree-sitter structural provider for `tmpDir`, writes a TypeScript fixture with `params.query.trim()`, runs `code_find` with `{ query: "params.query.trim", mode: "ast", kind: "call", scope: "src" }`, and expects the output to contain `params.query.trim`.
   - Update the `ast mode omits kind` expectation so the thrown error text must list `call` as a supported kind.

## Verification
Run these after adding the tests and before implementation:

```bash
set -v
RTK_DISABLED=1 pnpm -s vitest run packages/supi-tree-sitter/__tests__/call-sites.test.ts packages/supi-code-intelligence/__tests__/unit/code-find-tool.test.ts --reporter=verbose
```

Expected RED result: the new full-expression call-site assertions fail because current TypeScript-family extraction returns leaf names such as `trim`, and the updated error-message assertion may fail until `execute-find.ts` is aligned.

## Test mode
Test-driven. Watch the focused test command fail for the new behavior before changing implementation.
