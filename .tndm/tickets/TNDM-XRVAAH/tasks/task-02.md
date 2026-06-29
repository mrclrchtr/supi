# Task 2: GREEN: implement bounded package/tool-aware discovery

## Goal

Make the failing test-discovery regressions pass by extending deterministic candidate generation in the shared discovery helper.

## Files

- `packages/supi-code-intelligence/src/analysis/relations/tests.ts`
- Tests from Task 1 as needed for expectation refinements that preserve the same behavior.

## Changes

1. In `findConventionTestFiles()`, keep all existing same-directory, same-directory `__tests__`, and package-layout mirror candidates.
2. Add a small helper in `tests.ts` that derives additional exact candidates for source files under a package root:
   - only run when `cwd` and nearest package root are known
   - for `src/tool/execute-<name>.ts`, derive `name` from the filename after `execute-`
   - check both `__tests__/unit` and `__tests__/integration`
   - candidate stems must include exact bounded names such as `code-<name>-tool`, `<name>-tool`, and `execute-<name>`
   - use the source file extension and both `.test` / `.spec` suffixes
3. Only add candidates that exist on disk and are not support paths according to `isTestSupportPath()` / `isTestFilePath()`.
4. Preserve result sorting, deduplication, cap behavior, and provenance:
   - semantic-contributed files still yield `semantic+conventions`
   - convention-only files, including new tool/package-aware candidates, yield `conventions-only`
5. Do not introduce broad text search, import scanning, or workspace test indexing.

## Verification

Run the same focused test command from Task 1 and confirm the test-discovery failures now pass:

```bash
RTK_DISABLED=1 pnpm -s vitest run packages/supi-code-intelligence/__tests__/unit/analysis/relations-tests.test.ts packages/supi-code-intelligence/__tests__/unit/tool/execute-graph.test.ts packages/supi-code-intelligence/__tests__/unit/code-context-tool.test.ts packages/supi-code-intelligence/__tests__/unit/code-impact-tool.test.ts --reporter=verbose
```

Expected GREEN result: discovery-related tests pass and existing false-positive guard tests remain green.
