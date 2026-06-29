# Task 4: GREEN: fix impact seeds, likely tests, and likely test commands

## Goal

Make `code_impact` produce accurate affected-file/test evidence and actionable verification commands for both target-based and changed-files input.

## Files

- Modify `packages/supi-code-intelligence/src/use-case/generate-impact.ts`
- Modify `packages/supi-code-intelligence/src/presentation/markdown/affected.ts`
- Modify `packages/supi-code-intelligence/src/presentation/markdown/impact.ts`
- Modify `packages/supi-code-intelligence/src/types.ts`
- Update tests touched in Task 3 as needed for exact field names.

## Changes

1. In `generate-impact.ts`, make target-based analysis seed the affected set with the target file itself before adding semantic reference files. A zero-reference target should still have target-file evidence.
2. Replace the local `findLikelyTests()` / `findTestCompanions()` impact-only path with the shared helper from `analysis/relations/tests.ts` so impact uses the same test discovery as graph/context.
3. Preserve existing boundary-aware false-positive protections for test-path detection.
4. Add a structured list of likely test commands when tests are found. Use concrete workspace commands such as:

```bash
pnpm vitest run packages/supi-code-intelligence/__tests__/unit/tool/execute-graph.test.ts --reporter=verbose
```

When multiple likely test files are found, prefer one concise `pnpm vitest run <file...> --reporter=verbose` command if it stays readable; otherwise cap the list deterministically.
5. Add the command list to impact details if details metadata is updated. Keep field names explicit, for example `likelyTestCommands: string[]`.
6. Render a `## Likely Test Commands` section in impact/affected markdown only when commands exist.
7. Keep no-test output honest: do not fabricate commands when no deterministic test files were found.

## Verification

Run the RED command from Task 3 again:

```bash
RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/__tests__/unit/code-impact-tool.test.ts --reporter=verbose
```

Expected GREEN result: all selected impact tests pass.

Then run the focused graph/context/helper tests to catch shared-helper regressions:

```bash
RTK_DISABLED=1 pnpm vitest run \
  packages/supi-code-intelligence/__tests__/unit/analysis/relations-tests.test.ts \
  packages/supi-code-intelligence/__tests__/unit/tool/execute-graph.test.ts \
  packages/supi-code-intelligence/__tests__/unit/code-context-tool.test.ts \
  --reporter=verbose
```

Expected result: all selected tests pass.

## Test status

Test-driven. This task implements the minimal production code required to pass Task 3 tests while keeping Task 1/2 behavior green.
