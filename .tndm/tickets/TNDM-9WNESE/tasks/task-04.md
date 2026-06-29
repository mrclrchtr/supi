# Task 4: Update architecture notes and run targeted cross-package verification

## Goal
Document the new shared session-registry pattern and prove the cross-package refactor is safe with focused verification, including Tree-sitter packaging after its new `supi-core` runtime dependency.

## Changes
- Update `docs/tool-architecture.md` to note that session-scoped substrate services should reuse the shared core session-state registry infrastructure rather than duplicating `globalThis` + `Symbol.for(...)` maps.
- Update `packages/supi-core/CLAUDE.md` to describe the new registry-utils responsibility.
- Update `packages/supi-lsp/CLAUDE.md` and `packages/supi-tree-sitter/CLAUDE.md` to note that their session registries now delegate storage to the shared core helper while keeping package-specific state semantics local.
- Do not expand the docs into a broader redesign; keep them aligned to the minimal helper introduced in this change.

## Verification rationale
These doc edits are test-exempt because they describe behavior exercised by the targeted verification command. Run the full command and confirm:
- Biome stays clean for the touched packages.
- The focused registry tests pass.
- Source and test typechecks pass for all three packages.
- `node scripts/publish.mjs packages/supi-tree-sitter` succeeds, proving the new package dependency/bundling setup is correct.
