# Task 3: RED: codify impact accuracy, likely tests, and test-command output

## Goal

Write failing impact-tool tests for the audit failure: target-based impact must not report an empty affected/test set when the changed source file has package-layout tests but zero semantic references.

## Files

- Modify `packages/supi-code-intelligence/__tests__/unit/code-impact-tool.test.ts`
- Modify presentation/details tests only if needed for new structured fields:
  - `packages/supi-code-intelligence/__tests__/unit/details-metadata.test.ts`
  - `packages/supi-code-intelligence/__tests__/unit/presentation/relations-render.test.ts`

## Changes

Add tests in `code-impact-tool.test.ts` covering these cases:

1. Target-based impact with zero semantic references:
   - source: `src/tool/execute-graph.ts`
   - test: `__tests__/unit/tool/execute-graph.test.ts`
   - provider `references()` returns `[]`
   - call `code_impact` with a resolved `targetId` and `includeTests: true`
   - assert output contains the source file as affected evidence or check-next evidence, contains `__tests__/unit/tool/execute-graph.test.ts`, and does not present the result as having no relevant tests.
2. Target-based impact details:
   - assert `details.type === "impact"`
   - assert `details.data.likelyTests` includes the discovered test file.
   - if a new `likelyTestCommands` field is introduced, assert it includes a concrete `pnpm vitest run ... --reporter=verbose` command.
3. Changed-files impact:
   - call `code_impact` with `changedFiles: ["src/tool/execute-graph.ts"]` and `includeTests: true`
   - assert output includes the same likely test file and concrete test command.
4. No-test behavior:
   - a changed source file with no companions and no package-level mirror should not fabricate a command.

## Verification

Run this command and confirm the new assertions fail for the expected reason before implementation:

```bash
RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/__tests__/unit/code-impact-tool.test.ts --reporter=verbose
```

Expected RED result: failures mention missing likely tests, missing affected target file evidence, or missing likely test command output.

## Test status

Test-driven. This task is RED only; do not implement production code in this task.
