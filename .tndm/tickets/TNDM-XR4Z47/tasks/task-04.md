# Task 4: Thread maxResults through disambiguation and file-only resolution

## Goal

`resolveSymbolTarget()` hard-caps candidates at 8 and `executeResolveService()` doesn't pass `maxResults` to the symbol path. Example: `code_resolve({ query: "service", maxResults: 1 })` returns 8 candidates.

## Files

- `packages/supi-code-intelligence/src/targeting/resolve-symbol.ts` (lines 14, 94)
- `packages/supi-code-intelligence/src/analysis/resolve/service.ts` (line 316)

## Change

1. Add `maxResults` to the `resolveSymbolTarget()` options parameter (default remains 8 for backward compatibility).
2. Use it in the candidate slicing: `candidates.slice(0, maxResults)` instead of the constant `MAX_CANDIDATES`.
3. In the resolve service, pass `maxResults` through to `resolveSymbol()`.
4. In the file-only path, the `slice(0, maxResults)` already exists — verify it's applied correctly.

## TDD

1. Add test: `code_resolve({ query: "service", maxResults: 1 })` returns at most 1 candidate.
2. Add test: `code_resolve({ query: "service", maxResults: 3 })` returns at most 3 candidates.
3. Before the fix: both return 8 (the hard-cap), so at least the maxResults=1 test fails.
4. After the fix: tests pass.

Also verify the file-only path already respects maxResults (existing test covers this via `code_resolve({ file: "index.ts" })`).

## Verification

- New tests pass
- Existing disambiguation tests still pass
