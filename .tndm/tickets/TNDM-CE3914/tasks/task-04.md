# Task 4: Add unit tests for code action support in code_health

## Goal

Add unit tests for the new code action behavior in `code_health` and verify the hover absorption is already tested.

## Files

- `packages/supi-code-intelligence/__tests__/unit/code-health-tool.test.ts`

## Changes

1. **Code action rendering test**: Create a `HealthData` object with `codeActions` populated and verify the renderer output includes "### Code Actions" section with action titles.

2. **Code action empty test**: Verify that when `codeActions` is `null` or `[]`, the renderer does NOT produce a code actions section.

3. **Code action LSP query test**: Mock `getSessionLspService` to return a service with `codeActions` that returns action titles, then verify `executeHealthTool` with `level: "detailed"` includes those titles in its output.

4. **Summary mode skips code actions test**: Verify `executeHealthTool` with `level: "summary"` does not call `codeActions`.

5. **Verify existing tests still pass**: Run the full code-health test file.

## Existing coverage check

Verify that hover rendering in `code_brief` anchored mode is already tested — check `__tests__/unit/presentation/anchored-brief.test.ts` for hover section rendering.

## Verification

- All new tests pass
- Existing code-health tests still pass
- `pnpm exec vitest run packages/supi-code-intelligence/__tests__/unit/code-health-tool.test.ts` — 100% pass
