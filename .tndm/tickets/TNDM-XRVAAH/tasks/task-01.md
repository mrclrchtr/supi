# Task 1: RED: codify bounded tool/package-aware test discovery

## Goal

Add failing tests that prove bounded package/tool-aware discovery is required for `src/tool/execute-find.ts` to find `__tests__/unit/code-find-tool.test.ts` without broad search or semantic test evidence.

## Files

- `packages/supi-code-intelligence/__tests__/unit/analysis/relations-tests.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/tool/execute-graph.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/code-context-tool.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/code-impact-tool.test.ts`

## Changes

1. In `relations-tests.test.ts`, add a shared helper regression:
   - workspace source: `src/tool/execute-find.ts`
   - runnable test: `__tests__/unit/code-find-tool.test.ts`
   - no semantic references provider contribution
   - expected discovery: `kind === "found"`, provenance `"conventions-only"`, file `__tests__/unit/code-find-tool.test.ts`
2. In `execute-graph.test.ts`, add a public tool regression for `relations: ["tests"]` on `src/tool/execute-find.ts` that expects `__tests__/unit/code-find-tool.test.ts` in output/details.
3. In `code-context-tool.test.ts`, add the same target with `include: ["tests"]` and expect parity with graph output.
4. In `code-impact-tool.test.ts`, add target-based impact with `includeTests: true` and expect the likely test path and, when Vitest is detected, the matching `pnpm vitest run ... --reporter=verbose` command.
5. Keep helper/fixture exclusions covered by existing tests; extend only if the new test setup risks accepting helpers.

## Verification

Run the focused tests and confirm the new assertions fail for the intended reason before implementation:

```bash
RTK_DISABLED=1 pnpm -s vitest run packages/supi-code-intelligence/__tests__/unit/analysis/relations-tests.test.ts packages/supi-code-intelligence/__tests__/unit/tool/execute-graph.test.ts packages/supi-code-intelligence/__tests__/unit/code-context-tool.test.ts packages/supi-code-intelligence/__tests__/unit/code-impact-tool.test.ts --reporter=verbose
```

Expected RED result: at least one new assertion fails because `code-find-tool.test.ts` is not discovered for `src/tool/execute-find.ts`.
