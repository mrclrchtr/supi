# Archive

## Verification Evidence

### Task 1 — supi-settings scaffold
- `packages/supi-settings/package.json`, `tsconfig.json`, `src/api.ts`, `__tests__/tsconfig.json` all exist
- `pnpm exec tsc -b packages/supi-settings/tsconfig.json packages/supi-settings/__tests__/tsconfig.json` passes

### Task 2 — extension + test (TDD)
- `pnpm vitest run packages/supi-settings/` → PASS (1) FAIL (0)
- `src/extension.ts` imports `registerSettingsCommand` from `@mrclrchtr/supi-core/settings` and delegates

### Task 3 — supi-core library-ified
- `packages/supi-core/package.json`: no `pi` manifest key, no `"./extension"` in exports
- `packages/supi-core/src/extension.ts` deleted
- `pnpm vitest run packages/supi-core/` → 158 tests pass

### Task 4 — 13 packages updated
- `grep -r "supi-core/src/extension.ts" packages/*/package.json` → zero matches
- All 13 packages' `pi.extensions` arrays only contain `"./src/extension.ts"` (and `supi-code-intelligence` additionally keeps `supi-lsp` and `supi-tree-sitter` refs)

### Task 5 — root workspace
- `package.json pi.extensions` contains `./packages/supi-settings/src/extension.ts`
- `package.json pi.extensions` no longer contains `./packages/supi-core/src/extension.ts`

### Task 6 — test assertions
- `bundled-extension-refs.test.mjs` → PASS (14) FAIL (0) — library-only bundled deps no longer require extension refs
- `pack-staged.test.mjs` → supi-core test updated for library-only surface, supi-settings test added
- `package-import-smoke.test.mjs` → supi-core no longer required to resolve `./extension`

### Task 7 — docs
- `packages/supi-core/CLAUDE.md`: updated scope, removed extension.ts from source layout, removed `@mrclrchtr/supi-core/extension` gotcha
- `packages/supi-core/README.md`: removed `./extension` surface, updated install/pkg surfaces sections
- Root `CLAUDE.md`: packaging conventions note supi-core exception, entry points section updated, `/supi-settings` now references `supi-settings`

### Task 8 — full sweep
- `pnpm exec biome check` → 0 errors (1 pre-existing warning in supi-lsp)
- `pnpm vitest run` → 1663/1667 pass (4 pre-existing failures: 3 cyclic-symlink in supi-lsp pack, 1 flaky e2e)
- `pnpm pack:verify` → supi-settings and supi-core pack clean; pre-existing cyclic failures in supi-lsp/supi-tree-sitter
- `release-please-config.json`: `packages/supi-settings/package.json` added to extra-files
- Merge conflict blocks resolved in 9 package.json files (preserved `image` gallery fields)
