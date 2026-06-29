# Archive

## Verification Summary

### Scope
- Removed `code_brief` from the 10-tool public surface, merging it into `code_context`
- Fixed hover truncation in `code_context`'s `buildDefinitionLines`
- Fixed prompt guidelines for all 10 tools to follow pi docs (every guideline names its tool)
- Converged `CodeGraphParameters` workflow schema with active `CodeGraphExtendedParameters`

### TypeScript
```
pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json packages/supi-code-intelligence/__tests__/tsconfig.json
```
✅ No errors

### Tests
```
RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/
```
✅ 47 test files passed, 2 skipped
✅ 438 tests passed, 4 skipped (same as baseline)

### Lint
```
pnpm exec biome check packages/supi-code-intelligence/
```
✅ Clean (1 auto-fix applied)

### Changed files (28 files)
- `src/intent/types.ts` — removed `code_brief` from public names
- `src/tool/tool-specs.ts` — removed `code_brief` spec entry, updated all prompt guidelines
- `src/tool/target-id-params.ts` — updated internal comment
- `src/workflow/surface.ts` — updated absorption docs
- `src/workflow/schemas.ts` — converged `CodeGraphParameters`, added `SymbolParam`/`TargetIdParam`
- `src/use-case/generate-context.ts` — fixed hover truncation (1→5 lines), updated follow-up text
- `src/use-case/generate-inspect.ts` — updated follow-up text
- `src/use-case/generate-impact.ts` — updated follow-up text
- `src/use-case/generate-brief.ts` — updated follow-up text
- `src/brief.ts`, `src/brief-focused.ts` — updated follow-up text
- `src/presentation/markdown/*.ts` — updated follow-up text (7 files)
- `src/tool/execute-graph.ts` — updated follow-up text
- `CLAUDE.md` — removed `code_brief` section, updated contracts
- `README.md` — removed `code_brief`, updated surface listing
- 6 test files updated for new expectations
