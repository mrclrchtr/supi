## Plan: Fix production-readiness findings

### Files to create/modify

| File | Status | Purpose |
|---|---|---|
| `scripts/verify-tarball.mjs` | NEW | Standalone tarball verifier — checks zero `../` entries + clean extraction |
| `scripts/publish.mjs` | NEW | Wraps `packStaged()` + `verifyTarball()`; formal publish path |
| `package.json` | MODIFY | Add `pack:verify` script, wire into `verify` pipeline |
| `packages/supi-lsp/README.md` | MODIFY | Document `/lsp-status` output format |
| `packages/supi-lsp/.npmignore` | NEW | Empty file to suppress gitignore-fallback warning |
| `packages/supi-tree-sitter/.npmignore` | NEW | Empty file to suppress gitignore-fallback warning |
| `packages/supi-code-intelligence/.npmignore` | NEW | Empty file to suppress gitignore-fallback warning |

### Tasks

- [x] **Task 1**: Create `scripts/verify-tarball.mjs`
  - File: `scripts/verify-tarball.mjs` (NEW)
  - A standalone Node script that takes a tarball path as its only argument.
  - Lists tarball contents with `tar -tzf <path>`.
  - If any entry contains `../`, prints the offending paths to stderr and exits 1.
  - Extracts tarball to a temp dir with `tar -xzf`. If extraction fails (non-zero exit or error), exits 1.
  - On success, cleans up temp dir and exits 0.
  - No dependencies except Node built-ins (`child_process`, `fs`, `os`, `path`).
  - Verification:
    - Create a known-broken tarball (or use the broken supi-code-intelligence one from `/tmp/supi-pack-check-ci/mrclrchtr-supi-code-intelligence-0.1.0.tgz` if still available) → script exits 1 with path list.
    - Run against a staged-pack tarball (`/tmp/supi-staged-pack/mrclrchtr-supi-code-intelligence-0.1.0.tgz`) → script exits 0.

- [x] **Task 2**: Create `scripts/publish.mjs`
  - File: `scripts/publish.mjs` (NEW)
  - Takes a package directory as argument: `node scripts/publish.mjs packages/supi-code-intelligence`
  - Imports `packStaged` from `scripts/pack-staged.mjs` and calls it to produce a clean tarball in a temp output dir.
  - Imports `verifyTarball` from `scripts/verify-tarball.mjs` and verifies the produced tarball.
  - If verification fails, exits 1 with the error.
  - If verification passes, prints the tarball path.
  - Optional `--publish` flag: if set, runs `npm publish <tarball>` after verification. Without the flag, prints the tarball path only (ready for manual `npm publish`).
  - No dependencies except Node built-ins + the two sibling scripts.
  - Verification:
    - `node scripts/publish.mjs packages/supi-lsp` → produces clean tarball, prints path, exits 0.
    - `node scripts/publish.mjs packages/supi-code-intelligence` → produces clean tarball via staged pack, verifies, exits 0.

- [x] **Task 3**: Add `pack:verify` to root `package.json` and wire into `pnpm verify`
  - File: `package.json` (MODIFY)
  - Add a `pack:verify` script that does real staged pack + tarball verification for any package with `bundledDependencies` in its `package.json`.
  - The script loops over `packages/supi*`, checks `package.json` for non-empty `bundledDependencies`, and if found: `node scripts/publish.mjs "$p"` (without `--publish` flag — just pack + verify).
  - Add `&& pnpm pack:verify` to the end of the `verify` script so it runs after `pnpm pack:check`.
  - Verification:
    - `pnpm pack:verify` → all packages with bundledDependencies produce clean tarballs, exits 0.
    - `pnpm verify` → full pipeline passes including `pack:verify`.

- [x] **Task 4**: Document `/lsp-status` output in supi-lsp README
  - File: `packages/supi-lsp/README.md` (MODIFY)
  - Replace the bare `## Commands` section with a short example showing what `/lsp-status` displays.
  - Format: a brief ascii block showing active servers, file coverage, and diagnostic counts.
  - Verification: manual read of README — confirms example is present and accurate.

- [x] **Task 5**: Add `.npmignore` files to all three packages
  - Files (NEW): `packages/supi-lsp/.npmignore`, `packages/supi-tree-sitter/.npmignore`, `packages/supi-code-intelligence/.npmignore`
  - Content: empty files (zero bytes). The `files` field in `package.json` controls inclusion; `.npmignore` only exists to suppress the npm gitignore-fallback warning.
  - Verification:
    - `npm pack --pack-destination /tmp/supi-verify-npmignore --dry-run` in each package directory → no `gitignore-fallback` warning in stderr output.

- [x] **Task 6**: Full regression sweep
  - Run `pnpm verify` → all steps pass (WASM check, typecheck, typecheck:tests, biome, test, pack:check, pack:verify).
  - Run `node scripts/publish.mjs packages/supi-code-intelligence` → produces clean, verified tarball.
  - Check no warnings remain from `npm pack` on any of the three packages.
  - Verification: all commands exit 0, no warnings in output.