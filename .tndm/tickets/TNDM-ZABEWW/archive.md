# Archive

## Verification Results

### All 8 plan tasks completed

**Task 1** — Integration tests for clean staged manifests: 5 tests written, RED confirmed against old code, GREEN after implementation.

**Task 2** — Verifier tests for workspace: leakage: 4 tests written, RED confirmed against old verifyTarball, GREEN after implementation.

**Task 3** — Staged manifest helper (`scripts/staged-manifests.mjs`): tested manually against both `supi-lsp` and `supi` staged copies. `workspace:*` → exact version, `devDependencies` stripped, `bundledDependencies` preserved.

**Task 4** — Wired into `pack-staged.mjs`: 5 integration tests pass.

**Task 5** — Expanded `verify-tarball.mjs`: inspects all packed `package.json` files for `workspace:` protocol. 4 verifier tests pass.

**Task 6** — Real packaging checks:
- `node scripts/publish.mjs packages/supi-lsp`: packs, verifies, ready
- `node scripts/publish.mjs packages/supi`: packs, verifies, ready
- Both tarballs confirmed clean: no `workspace:` in root or bundled manifests, `devDependencies` null

**Task 7** — CLAUDE.md updated with `## Publish pipeline` section documenting the 4-stage pipeline.

**Task 8** — Full quality gates (fresh, 22:48 UTC):
- Tests: 2 suites, 9 tests passed
- Biome: clean on scripts/ package.json
- `pnpm pack:check`: 16 packages dry-run passed
- `pnpm pack:verify`: 14 packages with bundledDependencies packed, verified, and ready

### Tarball manifest evidence (supi-lsp)
```
Root deps: {"@mrclrchtr/supi-core": "0.2.0"}
Root devDeps: null
Bundled core devDeps: null
workspace: refs: none in any packed package.json
```

### Tarball manifest evidence (supi meta-package)
```
Root deps: {all workspace:* → exact versions, external deps unchanged}
Root devDeps: null
Bundled lsp deps: {"@mrclrchtr/supi-core": "0.2.0"}
Bundled code-intel deps: {"@mrclrchtr/supi-lsp": "1.0.0", "@mrclrchtr/supi-tree-sitter": "1.0.0", "@mrclrchtr/supi-core": "0.2.0"}
Bundled devDeps: all null
workspace: refs: none in any packed package.json
```

### Files changed
- `scripts/staged-manifests.mjs` (new)
- `scripts/__tests__/pack-staged.test.mjs` (new)
- `scripts/__tests__/verify-tarball.test.mjs` (new)
- `scripts/pack-staged.mjs` (modified)
- `scripts/publish.mjs` (modified)
- `scripts/publish-released.mjs` (modified)
- `scripts/verify-tarball.mjs` (modified)
- `package.json` (modified)
- `pnpm-lock.yaml` (modified)
- `CLAUDE.md` (modified)
