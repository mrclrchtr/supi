# Task 6: Finalize manifests, docs, and publish verification for the single install surface

## Goal
Make the package contracts and documentation match the new architecture: only `@mrclrchtr/supi-code-intelligence` is pi-installable, while `@mrclrchtr/supi-lsp` and `@mrclrchtr/supi-tree-sitter` are published libraries.

## Changes
1. Update package manifests.
   - `packages/supi-lsp/package.json` and `packages/supi-tree-sitter/package.json` should stop advertising `pi.extensions` and stop exporting `./extension`.
   - Trim substrate package peer dependencies and keywords so they reflect their new library-only role.
   - `packages/supi-code-intelligence/package.json` should become the only code-understanding family package that advertises the install surface.
   - Update the workspace root `package.json` development install surface so it no longer references deleted substrate extension entrypoints.
2. Update publish-manifest coverage in `scripts/__tests__/pack-staged.test.mjs`.
   - Keep explicit extension-surface assertions for packages that still ship extensions.
   - Add or adjust assertions so `packages/supi-lsp` and `packages/supi-tree-sitter` are verified as library-only publish surfaces.
3. Update user and maintainer docs.
   - Root docs: `README.md`, `CLAUDE.md`, `docs/package-layout.md`, `docs/tool-architecture.md`.
   - Package docs: `packages/supi-lsp/README.md`, `packages/supi-lsp/CLAUDE.md`, `packages/supi-tree-sitter/README.md`, `packages/supi-tree-sitter/CLAUDE.md`, `packages/supi-code-intelligence/README.md`, `packages/supi-code-intelligence/CLAUDE.md`.
   - The docs should clearly distinguish the umbrella install path from direct programmatic library imports.
4. Verify real tarballs with `node scripts/publish.mjs ...` for all three changed published packages.

## Test plan
- Start by making the publish-surface assertions fail in `scripts/__tests__/pack-staged.test.mjs`.
- Only consider the task complete once the targeted doc lint/type/package verification command in this task passes end to end.
