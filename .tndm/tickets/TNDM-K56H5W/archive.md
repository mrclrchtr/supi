# Archive

## Verification summary

### Rebase request check
- `git branch --show-current`
- `git rev-parse main`
- `git merge-base HEAD main`
- `git log --oneline --decorate --graph --max-count=12 --all --simplify-by-decoration`

Result: current branch `supi-wt1` is already based on local `main`; `HEAD`, `main`, and the merge-base all resolved to `3b0305f3207618d0cd8d1c229951ef0fe2f01330`. There were no additional commits to rebase and therefore no rebase conflicts to resolve.

### Task 1 — restore package ownership baseline
- `node - <<'NODE' ...manifest inspection... NODE`

Result:
- root `pi.extensions` includes `./packages/supi-lsp/src/extension.ts`, `./packages/supi-tree-sitter/src/extension.ts`, and `./packages/supi-code-intelligence/src/extension.ts`
- `packages/supi-lsp/package.json` exports `./api` and `./extension` and includes `pi.extensions`
- `packages/supi-tree-sitter/package.json` exports `./api` and `./extension` and includes `pi.extensions`
- `packages/supi-code-intelligence/package.json` bundles and references `supi-lsp` and `supi-tree-sitter` extensions instead of hosting those tool families directly

### Task 2 — `packages/supi-lsp` owns `lsp_*`
Fresh verification run:
- `RTK_DISABLED=1 pnpm vitest run -v packages/supi-lsp/__tests__/unit/focused-tools.test.ts packages/supi-lsp/__tests__/unit/guidance.test.ts packages/supi-lsp/__tests__/unit/service-actions.validation.test.ts packages/supi-lsp/__tests__/unit/settings-registration.test.ts packages/supi-lsp/__tests__/unit/renderer.test.ts`
- `RTK_DISABLED=1 pnpm vitest run -v packages/supi-lsp/__tests__/integration/service-actions.integration.test.ts packages/supi-lsp/__tests__/integration/service-actions-workspace.integration.test.ts packages/supi-lsp/__tests__/integration/e2e-smoke.test.ts`
- `RTK_DISABLED=1 pnpm exec tsc --noEmit -p packages/supi-lsp/tsconfig.json && RTK_DISABLED=1 pnpm exec tsc --noEmit -p packages/supi-lsp/__tests__/tsconfig.json`

Result:
- 5 unit test files passed, 73 tests passed
- 3 integration test files passed, 63 tests passed
- package and test TypeScript checks passed

### Task 3 — `packages/supi-tree-sitter` owns `tree_sitter_*`
Fresh verification run:
- `RTK_DISABLED=1 pnpm vitest run -v packages/supi-tree-sitter/__tests__/guidance.test.ts packages/supi-tree-sitter/__tests__/tool-focus.test.ts packages/supi-tree-sitter/__tests__/tool.test.ts packages/supi-tree-sitter/__tests__/smoke.test.ts`
- `RTK_DISABLED=1 pnpm exec tsc --noEmit -p packages/supi-tree-sitter/tsconfig.json && RTK_DISABLED=1 pnpm exec tsc --noEmit -p packages/supi-tree-sitter/__tests__/tsconfig.json`

Result:
- 4 test files passed, 32 tests passed
- package and test TypeScript checks passed

### Task 4 — `packages/supi-code-intelligence` owns only `code_*`
Fresh verification run:
- `RTK_DISABLED=1 pnpm vitest run -v packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts packages/supi-code-intelligence/__tests__/unit/tool-adapters.test.ts packages/supi-code-intelligence/__tests__/unit/guidance.test.ts`
- `RTK_DISABLED=1 pnpm exec tsc --noEmit -p packages/supi-code-intelligence/tsconfig.json && RTK_DISABLED=1 pnpm exec tsc --noEmit -p packages/supi-code-intelligence/__tests__/tsconfig.json`

Result:
- 2 test files passed, 25 tests passed
- package and test TypeScript checks passed

### Task 5 — retained fixes and packaging verification
Fresh verification run:
- `RTK_DISABLED=1 pnpm vitest run -v scripts/__tests__/pack-staged.test.mjs`
- `RTK_DISABLED=1 pnpm vitest run -v packages/supi-lsp/__tests__/unit/settings-registration.test.ts packages/supi-lsp/__tests__/unit/tsconfig-scope.test.ts packages/supi-lsp/__tests__/unit/service-actions.validation.test.ts packages/supi-lsp/__tests__/unit/service-actions.test.ts`
- `RTK_DISABLED=1 pnpm vitest run -v packages/supi-tree-sitter/__tests__/tool.test.ts`
- `RTK_DISABLED=1 pnpm vitest run -v packages/supi-code-intelligence/__tests__/unit/target-resolution.test.ts packages/supi-code-intelligence/__tests__/unit/tool-adapters.test.ts`
- `RTK_DISABLED=1 pnpm verify`

Result:
- `scripts/__tests__/pack-staged.test.mjs`: 1 file passed, 6 tests passed
- LSP regression set: 4 files passed, 49 tests passed
- Tree-sitter regression set: 1 file passed, 16 tests passed
- Code-intelligence regression set: 2 files passed, 27 tests passed
- `pnpm verify` passed end-to-end, including workspace typechecks, test suite, pack dry-runs, and tarball verification
- `pnpm verify` emitted one non-failing Biome warning for an unused suppression in `packages/supi-lsp/src/tool/register-tools.ts`; exit status was still success and all required verification gates passed

### Docs verification
Reviewed current docs against final code:
- `README.md`
- `packages/supi-lsp/README.md`
- `packages/supi-tree-sitter/README.md`
- `packages/supi-code-intelligence/README.md`

Confirmed the final documentation matches the restored install surface:
- root README lists `supi-lsp`, `supi-tree-sitter`, and `supi-code-intelligence` as separate install targets with the expected responsibilities
- `packages/supi-lsp/README.md` documents standalone `lsp_*` ownership and `/lsp-status`
- `packages/supi-tree-sitter/README.md` documents standalone `tree_sitter_*` ownership
- `packages/supi-code-intelligence/README.md` documents `code_*` ownership plus bundled activation of the substrate extensions

No further doc edits were required beyond the reverted root README/package-manifest updates.
