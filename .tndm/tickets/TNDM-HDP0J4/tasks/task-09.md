# Task 9: Full verification: typecheck, lint, test, audit

## Goal
Run the full verification suite to confirm the entire change works end-to-end.

## Steps

1. **Typecheck**: `pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json packages/supi-code-intelligence/__tests__/tsconfig.json`
2. **Lint**: `pnpm exec biome check packages/supi-code-intelligence/ --max-diagnostics=30`
3. **Unit tests**: `pnpm vitest run packages/supi-code-intelligence/`
4. **Downstream typecheck**: `pnpm exec tsc -b` (repo-wide)
5. **Grep audit**: Confirm no stale references to deleted modules in source:
   ```bash
   rg "execute-references|execute-calls|execute-implementations" packages/supi-code-intelligence/src/
   ```
   (should return nothing)
6. **Tool registration audit**: Confirm code_graph is registered and old tools are not:
   ```bash
   rg '"code_references"|"code_calls"|"code_implementations"' packages/supi-code-intelligence/src/
   ```
   (should return nothing — internal service references use different paths)

## Expected results
- All typechecks pass
- All tests pass
- No lint errors
- No stale references to old tool names or executor files in source
- code_graph is the only public relation tool
