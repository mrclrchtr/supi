# Task 4: RED/GREEN: make empty impact test discovery explicit

## Goal

When impact analysis is asked to include tests but bounded discovery finds none, make the output explicit instead of silently omitting test information.

## Files

- `packages/supi-code-intelligence/__tests__/unit/code-impact-tool.test.ts`
- `packages/supi-code-intelligence/src/presentation/markdown/affected.ts`
- `packages/supi-code-intelligence/src/presentation/markdown/impact.ts`
- `packages/supi-code-intelligence/src/use-case/generate-impact.ts` only if the renderer lacks enough structured information to distinguish omitted vs empty discovery.

## Changes

1. RED: add a `code-impact-tool.test.ts` regression for a target with `includeTests: true`, readable source, active provider, and no companion/tool/package tests.
   - Expected content should include an explicit sentence such as `No likely tests found by bounded companion/package discovery.`
   - Expected details should continue to include `tests.status === "empty"` when the tests metadata is present.
2. Run the focused impact test and confirm the new assertion fails before production changes.
3. GREEN: update renderers so an empty tests metadata result is rendered only when test discovery was requested and completed.
   - Do not show the note when `includeTests` was omitted.
   - Do not show the note for unavailable providers unless existing unavailable messaging already applies.
   - Preserve likely test command rendering when tests are found.
4. Keep changed-files impact evidence line: `**Evidence: structural**`.

## Verification

RED command:

```bash
RTK_DISABLED=1 pnpm -s vitest run packages/supi-code-intelligence/__tests__/unit/code-impact-tool.test.ts --reporter=verbose
```

Expected RED result: the explicit empty-test-note assertion fails before production changes.

GREEN command:

```bash
RTK_DISABLED=1 pnpm -s vitest run packages/supi-code-intelligence/__tests__/unit/code-impact-tool.test.ts --reporter=verbose
```

Expected GREEN result: new and existing impact tests pass.
