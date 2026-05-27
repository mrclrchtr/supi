# Task 2: Fix kind mapping: "symbol" must not filter, "export" maps to exportedOnly, "command"/"setting" rejected

## Goal

`kind: "symbol"` passes through to `resolveSymbolTarget()`'s substring filter, which matches no real LSP kind. Also `kind: "export"` doesn't enable `exportedOnly`, and `kind: "command"/"setting"` are accepted but unsupported.

## Files

- `packages/supi-code-intelligence/src/analysis/resolve/service.ts` (around line 292)
- `packages/supi-code-intelligence/src/targeting/resolve-symbol.ts` (line 55)

## Change

In `resolveQueryTarget()`, map the public `kind` before calling `resolveSymbol()`:

- `"symbol"` → omit kind filter (pass no kind restriction)
- `"export"` → pass `exportedOnly: true`
- `"command"`, `"setting"` → return an explicit "unsupported kind" error
- All other values → pass through to the existing kind filter

Implementation: add a small mapper function before the `resolveSymbol()` call that translates the public kind into the appropriate options.

## TDD

1. Add tests in `code-resolve-tool.test.ts`:
   - `kind: "symbol"` with a known symbol → resolves successfully
   - `kind: "export"` should pass `exportedOnly` (mocked)
   - `kind: "command"` → returns unsupported error
   - `kind: "class"` with a matching class → resolves, non-matching → not found
2. Before the fix: `kind: "symbol"` test fails (not found)
3. After the fix: all pass

## Verification

- New tests pass
- Existing `code_resolve` query tests pass

