# Task 5: Final verification — full test suite + manual smoke test

## Goal
Run full test suite, typecheck, and manual smoke test to confirm the assembled change is correct.

## Verification steps

### Automated
```bash
# Full test suite
pnpm exec vitest run packages/supi-code-intelligence/
# Typecheck
pnpm exec tsc -p packages/supi-code-intelligence/tsconfig.json
pnpm exec tsc -p packages/supi-code-intelligence/__tests__/tsconfig.json
# Biome check (existing-style only)
pnpm exec biome check packages/supi-code-intelligence/
```

### Manual smoke test
- Run `code_brief` with `file: "packages/supi-code-intelligence/src/brief-focused.ts"` — verify outline, imports, exports, diagnostics sections appear when tree-sitter + LSP are active
- Run `code_brief` with `path: "packages/supi-code-intelligence/src"` — verify module brief shows diagnostics + entrypoint outlines
- Run `code_brief` with `file: "..."` `maxResults: 3` — verify caps are applied to outline (3 items), imports (3 items), exports (3 items), diagnostics (3 items)
- Run `code_brief` with `file: "packages/supi-code-intelligence/src/brief-focused.ts"` `line: 20` `character: 1` — verify anchored brief still works
- Run `code_map` with `path: "packages/supi-code-intelligence/src"` — verify no regression

## Success criteria
- All tests pass
- Typecheck clean
- No new biome issues
- Smoke test shows enrichment sections

