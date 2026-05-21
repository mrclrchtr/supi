# Task 1: Add a regression test proving packed @mrclrchtr/supi installs expose bundled packages' external runtime deps

## Goal
Create a focused regression test that fails against the current behavior and demonstrates the packaging bug.

## File
- `scripts/__tests__/pack-staged.test.mjs`

## Change
- Add one targeted test for `packages/supi` that:
  1. runs `packStaged("packages/supi", { outDir })`
  2. installs the produced tarball into a fresh temp npm project
  3. checks that bundled sub-packages can resolve their external runtime deps after install
- Reuse existing tarball helpers in the file where practical; keep the test small and packaging-focused.
- Assert at least these runtime deps through installed package resolution:
  - `typescript` for `@mrclrchtr/supi-lsp`
  - `web-tree-sitter` for `@mrclrchtr/supi-tree-sitter`
  - `clipboardy` for `@mrclrchtr/supi-extras`

## Verification
Run the test alone first and confirm it fails for the current missing-dependency regression.
