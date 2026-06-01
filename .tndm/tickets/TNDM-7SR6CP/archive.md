# Archive

## Verification

### Test results
- 463 tests passing, 4 skipped (up from 461)
- 0 typecheck errors (`pnpm exec tsc -b`)

### Wave 1: Removed brittleness
1a. `code_find` AST `kind: call` now uses ripgrep call-site search. `kind: type|test` return honest "not yet implemented".
1b. `baseRef` removed from `code_impact` schema, types, executor, renderer. 3 test files updated.
1c. `code_refactor` operations narrowed to `["rename", "rename_symbol"]`. Schema, tool-specs, and tests updated.
1d. `code_apply` modes narrowed to `["apply"]`. Schema, tool-specs, executor types updated.

### Wave 2: Finished high-ROI features
2a. `code_graph` `tests` relation implemented — reuses extracted `findTestCompanionFiles`/`extractTestFunctions` from shared module `src/analysis/relations/tests.ts`.
2b. `code_find` AST `kind: call` implemented — ripgrep-based call-site search with declaration filtering. Works without tree-sitter provider.

### Files changed
- `src/workflow/schemas.ts` — removed baseRef, narrowed refactor ops, narrowed apply modes
- `src/tool/execute-find.ts` — added executeCallSiteSearch, honest not-yet-implemented for type/test
- `src/tool/tool-specs.ts` — updated descriptions and guidelines
- `src/tool/execute-impact.ts` — removed baseRef from types
- `src/use-case/generate-impact.ts` — removed baseRef from input/deps
- `src/presentation/markdown/impact.ts` — removed baseRef rendering
- `src/tool/execute-apply.ts` — narrowed mode type
- `src/tool/execute-graph.ts` — added tests relation with shared test-discovery
- `src/pattern-structured.ts` — added call-site matching for kind: call
- `src/analysis/relations/tests.ts` — NEW shared module for test-file discovery
- `src/use-case/generate-context.ts` — uses shared test module, removed duplicate code
- 5 test files updated
