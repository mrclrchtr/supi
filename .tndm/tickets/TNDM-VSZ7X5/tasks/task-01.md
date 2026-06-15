# Task 1: RED: codify shared package-layout test discovery for graph/context

## Goal

Write failing tests that prove the current test-discovery logic misses package-layout tests unless semantic references point directly at the source symbol.

## Files

- Create `packages/supi-code-intelligence/__tests__/unit/analysis/relations-tests.test.ts`
- Modify `packages/supi-code-intelligence/__tests__/unit/tool/execute-graph.test.ts`
- Modify `packages/supi-code-intelligence/__tests__/unit/code-context-tool.test.ts`

## Changes

1. In `relations-tests.test.ts`, add tests for a shared test-discovery helper contract before implementing the helper:
   - Given source `src/tool/execute-graph.ts` and test file `__tests__/unit/tool/execute-graph.test.ts`, discovery returns the test file even when semantic `references()` returns an empty array.
   - Existing semantic-reference/import evidence still wins when it points at a test file.
   - False positives remain rejected: `contest.ts`, `testing.ts`, and `tool-specs.ts` are not classified as tests merely because they contain the substring `test`.
   - When an outline provider is supplied for a discovered test file, test names from that outline are exposed to callers.
2. In `execute-graph.test.ts`, add a `relations: ["tests"]` regression where:
   - source file is `src/tool/execute-graph.ts`
   - test file is `__tests__/unit/tool/execute-graph.test.ts`
   - mock `references()` returns `[]`
   - `code_graph` output still contains `__tests__/unit/tool/execute-graph.test.ts`.
3. In `code-context-tool.test.ts`, add the same package-layout regression for `include: ["tests"]`, asserting the context output contains the test file and extracted test name when outline data is available.

## Verification

Run this command and confirm the new assertions fail for the expected reason before implementation:

```bash
RTK_DISABLED=1 pnpm vitest run \
  packages/supi-code-intelligence/__tests__/unit/analysis/relations-tests.test.ts \
  packages/supi-code-intelligence/__tests__/unit/tool/execute-graph.test.ts \
  packages/supi-code-intelligence/__tests__/unit/code-context-tool.test.ts \
  --reporter=verbose
```

Expected RED result: failures mention missing package-layout test discovery or missing `__tests__/unit/tool/execute-graph.test.ts`, not syntax/import errors.

## Test status

Test-driven. This task is RED only; do not implement production code in this task.
