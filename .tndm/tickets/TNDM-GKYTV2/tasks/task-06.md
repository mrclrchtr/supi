# Task 6: Update repo and package docs to match the modular single-extension design

## Goal
Align maintainer-facing and user-facing docs with the new ownership model: `supi-code-intelligence` is the sole extension exposer, `supi-lsp` / `supi-tree-sitter` are library-only, and `packages/supi-code-intelligence` now uses the explicit `app` / `substrate` / `analysis` / `tool` / `presentation` layout.

## Files
- update `docs/package-layout.md`
- update `docs/tool-architecture.md`
- update `packages/supi-code-intelligence/README.md`
- update `packages/supi-code-intelligence/CLAUDE.md`
- update `packages/supi-lsp/README.md`
- update `packages/supi-lsp/CLAUDE.md`
- update `packages/supi-tree-sitter/README.md`
- update `packages/supi-tree-sitter/CLAUDE.md`

## Change
1. Rewrite the relevant sections in `docs/package-layout.md` and `docs/tool-architecture.md` so they describe `packages/supi-code-intelligence` as the owner of all three tool families and document the new internal layer layout.
2. Update `packages/supi-code-intelligence/README.md` and `packages/supi-code-intelligence/CLAUDE.md` so the architecture section reflects the new app/substrate/analysis/tool/presentation boundaries.
3. Update `packages/supi-lsp/README.md`, `packages/supi-lsp/CLAUDE.md`, `packages/supi-tree-sitter/README.md`, and `packages/supi-tree-sitter/CLAUDE.md` so they describe those packages as library-only surfaces rather than standalone pi-installable tool packages.
4. Remove stale references to substrate `./extension` surfaces, standalone `pi install npm:@mrclrchtr/supi-lsp`, standalone `pi install npm:@mrclrchtr/supi-tree-sitter`, and old ownership text that says the substrate packages own the expert-tool families.

## Verification
- **Rationale for test exemption**: this task is documentation-only.
- **Manual verification**: run `rg -n 'pi install npm:@mrclrchtr/supi-(lsp|tree-sitter)|@mrclrchtr/supi-(lsp|tree-sitter)/extension|all lsp_\* expert tools|all tree_sitter_\* expert tools' docs/package-layout.md docs/tool-architecture.md packages/supi-code-intelligence/README.md packages/supi-code-intelligence/CLAUDE.md packages/supi-lsp/README.md packages/supi-lsp/CLAUDE.md packages/supi-tree-sitter/README.md packages/supi-tree-sitter/CLAUDE.md` and expect **no stale install-surface/ownership matches**.
- **Manual verification**: review the rendered diff and confirm the new internal layer names and ownership rules are consistent across all eight files.

## Test strategy
Test-exempt for the docs-only scope, with the grep check and diff review above as the mandatory verification gate.
