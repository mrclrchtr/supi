# Archive

## Verification Results

### Fresh `pnpm verify` run
- ✅ WASM checks (kotlin, sql): current
- ✅ Typecheck (source + tests, all packages): no errors
- ✅ Biome CI: no errors
- ✅ Tests: 139 files, 1,478 passed, 0 failures
- ✅ pack:check (15 packages, dry-run): all clean
- ✅ pack:verify (13 bundled packages, real tarball + verification): all Verified: OK
- Exit code: 0

### `.npmignore` warnings
- supi-lsp: clean (no gitignore-fallback warning)
- supi-tree-sitter: clean
- supi-code-intelligence: clean

### `publish.mjs` end-to-end
- `node scripts/publish.mjs packages/supi-code-intelligence` → Packed, Verified: OK, Ready to publish. Exit: 0

### Slop detection
- CLAUDE.md: vocab score 0 (clean). Structural flags from pre-existing gotchas format — not from new additions
- packages/supi-lsp/README.md: score 0 (clean)

### Doc accuracy
- CLAUDE.md `pack:verify` entry → matches `package.json` scripts
- CLAUDE.md publish gotcha → `scripts/publish.mjs`, `pack-staged.mjs`, `verify-tarball.mjs` all exist with described behavior
- supi-lsp README `/lsp-status` example → matches source code (ui.ts buildLspInspectorContainer)
