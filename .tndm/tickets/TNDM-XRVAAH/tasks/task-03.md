# Task 3: RED/GREEN: deduplicate same-line reference display

## Goal

Prevent grouped reference output from rendering duplicate same-line locations such as `L183, L183` when semantic providers return multiple ranges on the same line.

## Files

- `packages/supi-code-intelligence/__tests__/unit/tool/execute-graph.test.ts`
- `packages/supi-code-intelligence/src/use-case/support/semantic-references.ts`

## Changes

1. RED: add or extend an `execute-graph.test.ts` regression where semantic references include two ranges in the same file and same display line.
   - Expected markdown should include the line once, for example `L183`, not `L183, L183`.
   - Keep different lines in the same file compacted correctly, for example `L17, L183` or ranges when consecutive.
2. Run the focused graph test and confirm the new assertion fails before changing production code.
3. GREEN: update `compactLineRanges()` or `formatReferenceList()` in `semantic-references.ts` to dedupe line numbers before compacting ranges.
4. Preserve existing grouping by file, `maxResults` behavior, and omitted-file messaging.

## Verification

RED command:

```bash
RTK_DISABLED=1 pnpm -s vitest run packages/supi-code-intelligence/__tests__/unit/tool/execute-graph.test.ts --reporter=verbose
```

Expected RED result: the duplicate-line assertion fails before production changes.

GREEN command:

```bash
RTK_DISABLED=1 pnpm -s vitest run packages/supi-code-intelligence/__tests__/unit/tool/execute-graph.test.ts --reporter=verbose
```

Expected GREEN result: the duplicate-line assertion and existing graph tests pass.
