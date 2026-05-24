# Task 5: Remove obsolete substrate extension surfaces and migrate/delete extension-only tests

## Goal
Finish the code-level boundary change by removing substrate-owned pi adapters and leaving only library runtime code behind in `packages/supi-lsp` and `packages/supi-tree-sitter`.

## Changes
1. Delete the old LSP extension entrypoints and pi-only support modules after the umbrella adapter has replaced them.
   - Remove the exact LSP files listed in the task file list once no remaining source imports them.
2. Delete the old Tree-sitter extension entrypoints and pi-only tool registration files after the umbrella adapter has replaced them.
   - Remove the exact Tree-sitter files listed in the task file list once no remaining source imports them.
3. Migrate or remove the old extension-only tests.
   - Delete the exact obsolete test files listed in the task file list if their coverage now lives in `packages/supi-code-intelligence`.
   - If any listed test still covers library-only behavior, rewrite it against the public `/api` surface instead of the deleted extension entrypoints.
4. Keep the substrate packages green as libraries after the deletions.

## Test plan
- Run the full package test suites for `packages/supi-lsp`, `packages/supi-tree-sitter`, and `packages/supi-code-intelligence` after the deletions.
- Treat any leftover references to `src/lsp.ts`, `src/tree-sitter.ts`, or substrate `src/tool/*` registration files as failures that must be removed in this task.
