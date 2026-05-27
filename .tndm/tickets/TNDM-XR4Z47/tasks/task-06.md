# Task 6: Fix disambiguation markdown: drop unregistered code_context suggestion

## Goal

The disambiguation markdown renderer suggests `code_context` as a follow-up tool, but `code_context` is intentionally unregistered in Phase 1. Replace it with `code_brief` (registered) or just keep `code_references`.

## File

- `packages/supi-code-intelligence/src/presentation/markdown/resolve.ts` line 113

## Change

Change:
```
2. Or use a candidate's `targetId` directly with `code_references`, `code_context`, etc.
```
To:
```
2. Or use a candidate's `targetId` directly with `code_references`, `code_brief`, etc.
```

## TDD

1. Add a test in `code-resolve-tool.test.ts` that triggers disambiguation and asserts the output does NOT contain `code_context`.
2. Before the fix: the test fails (string contains `code_context`).
3. After the fix: the test passes.

## Verification

- New test passes
- Existing markdown/render tests pass

