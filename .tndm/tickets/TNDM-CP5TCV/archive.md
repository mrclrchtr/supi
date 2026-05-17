# Archive

## Verification Results (fresh, 2026-05-17)

### Boundary import checks
- `rg` for bare package imports (`@mrclrchtr/supi-core`, `@mrclrchtr/supi-lsp`, etc.) in source/tests: **no matches** ✅
- `rg` for deep `src/...` imports across packages: **no matches** ✅

### Docs import check
- `rg` for bare import examples in CLAUDE.md, README.md, CLAUDE.md files: **no matches** ✅
- All docs references now use explicit `/api` or `/extension` subpaths

### Packaging smoke tests
- `pnpm vitest run scripts/__tests__/pack-staged.test.mjs scripts/__tests__/package-import-smoke.test.mjs -v`: **11/11 passed** ✅

### Task 7 sweep reference
- `pnpm verify` (typecheck + biome + 1580 tests + pack:check + pack:verify): **all green** ✅
- Meta-package publish (`node scripts/publish.mjs packages/supi`): **packed + verified** ✅
- Standalone package publish (`supi-lsp`, `supi-tree-sitter`, `supi-code-intelligence`): **packed + verified** ✅

### Key architectural outcomes
1. Every published package exposes `./api` and `./extension` subpath exports, with no `.` root surface
2. `pi.extensions` entries remain real file paths (`./src/extension.ts`), not subpath aliases
3. Meta-package is now assembled from standalone production tarballs extracted into `node_modules/`
4. Third-party runtime deps (`clipboardy`, `web-tree-sitter`, `diff`) removed from meta-package's `dependencies` — they belong to the standalone packages that import them
5. `supi-core` now provides a minimal `/supi-settings` extension
6. `supi-web` has a single aggregated `src/extension.ts`
7. All internal repo imports use `/api` or `/extension` subpaths consistently
