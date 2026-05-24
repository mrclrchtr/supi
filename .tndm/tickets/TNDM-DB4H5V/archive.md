# Archive

## Verification Evidence

### Test Results
- `pnpm vitest run packages/supi-code-intelligence/` — **22/22 test files passed, 213/213 tests passed**
- **No regressions:** all existing behavior contracts preserved (code_map factual, code_pattern heuristic, semantic-only symbol discovery, explicit disambiguation, hidden overview display:false with dedupe)

### TypeScript
- `tsc --noEmit -p packages/supi-code-intelligence/tsconfig.json` — **no new errors** (only pre-existing TS6305/TS7006)
- `tsc --noEmit -p packages/supi-code-intelligence/__tests__/tsconfig.json` — **no new errors** (only pre-existing TS6305/TS7006)

### Lint
- `biome check packages/supi-code-intelligence` — **clean** (only expected `noDeprecatedImports` for the backward-compat `executePatternAction` wrapper in test files)

### Post-review Fixes
Code review found 4 issues; all resolved:
1. Type error in generate-relations.ts (RelationsResolutionParams) — fixed function signatures
2. code_brief treating source-only projects as no-model — fixed `modules.length === 0` guard
3. Empty structured pattern hiding partial-scan warnings — added warning to empty-state renderer
4. code_map skipping dotfile landmarks — fixed `shouldSkipEntry` to only skip dot dirs

### Docs Updated
- README.md Source section — updated to describe use-case/presentation/targeting layers
- CLAUDE.md architecture tree — updated to reflect new file layout
