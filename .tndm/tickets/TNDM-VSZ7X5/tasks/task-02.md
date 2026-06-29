# Task 2: GREEN: implement shared test discovery and wire graph/context to it

## Goal

Implement the shared deterministic test-discovery helper and make `code_graph` and `code_context` use it.

## Files

- Modify `packages/supi-code-intelligence/src/analysis/relations/tests.ts`
- Modify `packages/supi-code-intelligence/src/tool/execute-graph.ts`
- Modify `packages/supi-code-intelligence/src/use-case/generate-context.ts`
- Update tests added or touched in Task 1 as needed for exact names/types.

## Changes

1. In `tests.ts`, add exported types/functions for shared discovery. The helper should return discovered test files with enough metadata for callers to render paths and optional test names. Required behavior:
   - Accept `cwd`, absolute source file path, optional source position, optional semantic `references`, optional structural `outline`, and a result cap.
   - Use semantic reference/import evidence first by reusing the existing reference-based behavior.
   - Add deterministic path fallbacks:
     - same-directory companions such as `foo.test.ts` and `foo.spec.ts`
     - same-directory `__tests__/foo.test.ts` and `__tests__/foo.spec.ts`
     - package-level mirrors such as `packages/supi-code-intelligence/__tests__/unit/tool/execute-graph.test.ts` for `packages/supi-code-intelligence/src/tool/execute-graph.ts`
     - package-level `__tests__/integration/...` mirrors using the same source-relative path without the leading `src/`
   - Deduplicate by absolute path, sort deterministically, and cap results.
   - Keep the existing language-agnostic test-file detection helpers and false-positive protections.
   - Extract test names through `extractTestFunctions()` when an outline provider is supplied.
2. In `execute-graph.ts`, replace direct `findTestCompanionFiles()` usage in the `tests` relation with the shared helper. Preserve the existing no-tests and unavailable-provider messages when no evidence is available.
3. In `generate-context.ts`, replace direct `findTestCompanionFiles()` usage in `buildTestsSection()` with the shared helper. Keep the section concise and cap rendered files/test names.

## Verification

Run the RED command from Task 1 again:

```bash
RTK_DISABLED=1 pnpm vitest run \
  packages/supi-code-intelligence/__tests__/unit/analysis/relations-tests.test.ts \
  packages/supi-code-intelligence/__tests__/unit/tool/execute-graph.test.ts \
  packages/supi-code-intelligence/__tests__/unit/code-context-tool.test.ts \
  --reporter=verbose
```

Expected GREEN result: all selected tests pass, including the package-layout cases and the existing semantic-reference cases.

## Test status

Test-driven. This task implements the minimal production code required to pass Task 1 tests.
