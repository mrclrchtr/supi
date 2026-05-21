# Archive

Fresh verification on 2026-05-21:

- `RTK_DISABLED=1 pnpm vitest run -v scripts/__tests__/pack-staged.test.mjs`
  - Exit status: 0
  - Result: 1 test file passed, 10 tests passed.
  - Includes the new regression proving a packed `packages/supi` install exposes bundled-package external runtime deps by resolving:
    - `typescript` from `node_modules/@mrclrchtr/supi/node_modules/@mrclrchtr/supi-lsp/src/extension.ts`
    - `web-tree-sitter` from `node_modules/@mrclrchtr/supi/node_modules/@mrclrchtr/supi-tree-sitter/src/extension.ts`
    - `clipboardy` from `node_modules/@mrclrchtr/supi/node_modules/@mrclrchtr/supi-extras/src/extension.ts`

- `node scripts/publish.mjs packages/supi`
  - Exit status: 0
  - Result: packed `/var/folders/r6/hrsh_d017xsf08fd0rjqz9_m0000gn/T/supi-publish/mrclrchtr-supi-1.4.0.tgz`, tarball verification passed (`Verified: OK`), ready to publish.

Documentation update:
- Updated `packages/supi/CLAUDE.md` to document that `scripts/pack-staged.mjs` augments the staged meta-package manifest with bundled packages' third-party runtime deps, so maintainers should not manually duplicate those deps in `packages/supi/package.json`.

Implementation summary:
- `scripts/pack-staged.mjs` now collects third-party runtime dependencies from bundled `@mrclrchtr/*` workspace packages recursively and merges them into the staged root manifest for `@mrclrchtr/supi` before `npm pack`.
- `scripts/__tests__/pack-staged.test.mjs` now covers the regression by installing a packed meta-package tarball into a fresh temp project and asserting dependency resolution from bundled package entrypoints.
