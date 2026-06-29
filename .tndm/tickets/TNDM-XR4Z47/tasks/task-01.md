# Task 1: Fix file-only resolve to pass both semantic and structural provider halves

## Goal

File-only `code_resolve` never uses semantic document symbols because `executeResolveService()` passes the composite `CodeProvider` only as `{ structural: provider }` to `resolveFileTargetGroup()`.

## Files

- `packages/supi-code-intelligence/src/analysis/resolve/service.ts` (lines 235, 264)

## Change

In `resolveFileOnlyInput()` and `resolvePathQuery()`, change the deps object from:
```ts
{ structural: provider ?? undefined }
```
to:
```ts
{ semantic: provider ?? undefined, structural: provider ?? undefined }
```

The composite `CodeProvider` implements both `SemanticProvider` and `StructuralProvider`, so the same object satisfies both.

## TDD

1. Add a test in `code-resolve-tool.test.ts` that mocks both `documentSymbols` (semantic) and `exports` (structural) on the provider, then calls `code_resolve({ file: "index.ts" })` and asserts the resolved targets come from semantic symbols (richer data, different names/positions than structural).
2. Before the fix: the test fails because only structural exports are used.
3. After the fix: the test passes — semantic document symbols are preferred.

## Verification

- New test passes
- Existing `code_resolve` file-only test still passes
- Full package tests pass
