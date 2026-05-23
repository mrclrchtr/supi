# Archive

## Verification Results

All tests run fresh on 2026-05-22.

### Biome
- `pnpm exec biome check packages/supi-core/` — 37 files, clean, no fixes applied

### TypeScript
- `pnpm exec tsc --noEmit -p packages/supi-core/tsconfig.json` — no errors
- `pnpm exec tsc --noEmit -p packages/supi-core/__tests__/tsconfig.json` — no errors

### Unit tests
- `pnpm vitest run packages/supi-core/` — 156/156 pass (60 suites)
  - New tool-framework tests: 14/14 pass (derivePromptSurface, registerSuiPiTools, shared params)

### Downstream smoke
- `pnpm vitest run packages/supi-lsp/ packages/supi-code-intelligence/ packages/supi-tree-sitter/` — 781/781 pass (257 suites)
  - No mock breakage from new supi-core exports

### Docs
- `packages/supi-core/CLAUDE.md` updated: source layout, test layout, key paths, scope

### External review
- Code review (copilot/gpt-5.4): patch is correct (88% confidence), no concrete correctness issues found
