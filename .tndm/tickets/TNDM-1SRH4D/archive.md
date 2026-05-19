# Archive

Fresh verification run on 2026-05-18:

- Command: `pnpm exec biome check packages/supi-lsp/src/guidance.ts packages/supi-lsp/__tests__/guidance.test.ts packages/supi-tree-sitter/src/tree-sitter.ts packages/supi-tree-sitter/__tests__/tool.test.ts packages/supi-code-intelligence/src/guidance.ts packages/supi-code-intelligence/__tests__/integration.test.ts && pnpm vitest -v run packages/supi-lsp/__tests__/guidance.test.ts packages/supi-tree-sitter/__tests__/tool.test.ts packages/supi-code-intelligence/__tests__/integration.test.ts`
- Result: passed
- Evidence: Biome checked 6 files with no fixes needed; Vitest reported `Test Files 3 passed` and `Tests 58 passed (58)`.

Plan/task completion check:
- `supi_tndm_cli task_list TNDM-1SRH4D` showed Tasks 1-4 all marked `done`.
- Final implementation matches the approved design:
  - `packages/supi-lsp/src/guidance.ts` now keeps only lean standalone LSP guidance plus minimal diagnostics/recovery steering.
  - `packages/supi-tree-sitter/src/tree-sitter.ts` now keeps only parser/structure-focused guidance and does not mention sibling extensions.
  - `packages/supi-code-intelligence/src/guidance.ts` now acts as the concise cross-tool router.

Diff/doc review:
- `git diff -- packages/supi-lsp/src/guidance.ts packages/supi-lsp/__tests__/guidance.test.ts packages/supi-tree-sitter/src/tree-sitter.ts packages/supi-tree-sitter/__tests__/tool.test.ts packages/supi-code-intelligence/src/guidance.ts packages/supi-code-intelligence/__tests__/integration.test.ts` showed only the planned guidance/test changes (6 files changed, 88 insertions, 142 deletions).
- Reviewed package docs:
  - `packages/supi-lsp/README.md`
  - `packages/supi-tree-sitter/README.md`
  - `packages/supi-code-intelligence/README.md`
- Conclusion: no living doc updates were required because those READMEs describe package surfaces/actions at a stable level and do not document the removed prompt-guidance wording or pseudocode blocks.

