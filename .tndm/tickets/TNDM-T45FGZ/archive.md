# Archive

## Fresh verification evidence (2026-05-24)

### Task 1 — .gitignore
- `packages/*/dist/` pattern present ✓
- `packages/*/tsconfig.tsbuildinfo` pattern present ✓
- `packages/*/__tests__/tsconfig.tsbuildinfo` pattern present ✓

### Task 2 — package.json scripts
- `typecheck` uses `tsc -b packages/*/tsconfig.json packages/*/__tests__/tsconfig.json` ✓
- `typecheck:tests` removed ✓
- `verify` chain clean (no typecheck:tests) ✓

### Task 3 — Composite source tsconfigs
- supi-core: builds, emits 19 .d.ts files ✓
- supi-lsp: builds, emits 35 .d.ts files ✓
- supi-tree-sitter: builds, emits 17 .d.ts files ✓

### Task 4 — Non-composite source tsconfigs
- supi-ask-user (1 ref → supi-core): builds clean ✓
- supi-code-intelligence (3 refs → supi-core, supi-lsp, supi-tree-sitter): builds clean ✓

### Task 5 — Test tsconfigs
- Standard pattern (supi-ask-user): builds clean ✓
- Nested path (supi-bash-timeout unit/): builds clean ✓
- 3 references (supi-code-intelligence): builds clean ✓
- Specific includes (supi-debug): builds clean ✓
- Specific includes (supi-extras): builds clean ✓

### Task 6 — Performance
- **Cold typecheck** (no dist, no tsbuildinfo): ~8.8s (was 57.1s → 6.4× faster)
- **Warm typecheck** (cached): ~8.0s (was 57.1s → 7.1× faster)
- **All source and test tsconfigs** pass typecheck via single `tsc -b` command
- 3 pre-existing vitest failures unchanged
- Pre-existing `e2e-smoke.test.ts` type error (exists in old config too)
- All pack checks pass

### Docs updated
- CLAUDE.md: package-scoped commands updated from `tsc --noEmit -p` to `tsc -b`

### Files changed
29 files: .gitignore, package.json, CLAUDE.md, 14 source tsconfigs, 13 test tsconfigs
