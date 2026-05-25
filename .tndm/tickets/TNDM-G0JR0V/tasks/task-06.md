# Task 6: Update docs, tests, scripts, and skills to match the planner-backed surface and new code_refactor tool

## Goal
Align package docs, maintainer notes, tests, scripts, and skill guidance with the planner-backed architecture and the addition of `code_refactor`, while keeping the existing read-only `code_*` tool names.

## Files
- Modify core docs:
  - `packages/supi-code-intelligence/README.md`
  - `packages/supi-code-intelligence/CLAUDE.md`
  - `packages/supi-lsp/README.md`
  - `packages/supi-lsp/CLAUDE.md`
  - `packages/supi-tree-sitter/README.md`
  - `packages/supi-tree-sitter/CLAUDE.md`
  - `packages/supi-code-runtime/README.md`
  - `packages/supi-code-runtime/CLAUDE.md`
- Sweep and update stale references in:
  - `packages/supi-debug/src/status-log.ts`
  - `packages/supi-claude-md/skills/`
  - `scripts/check-supi-container-load`
  - `docs/tool-architecture.md`
  - `packages/supi-lsp/__tests__/integration/e2e-smoke.test.ts`
- Update any other files under `packages/`, `scripts/`, `docs/`, `.pi/`, or `.agents/` that contain stale assumptions about the old internal architecture or lack the new `code_refactor` tool.

## Change
This task is **test-exempt** because it is documentation/compatibility cleanup built on already-tested behavior from earlier tasks.

1. Update package READMEs and `CLAUDE.md` files so they describe:
   - the planner-backed architecture
   - the shared broker/runtime responsibilities
   - the existing read-only `code_*` surface plus the new `code_refactor` tool
   - `lsp_*` and `tree_sitter_*` as expert/debug surfaces where appropriate
2. Update scripts, skills, and smoke/integration tests that hardcode tool inventories or guidance so they include `code_refactor` and do not encode stale architectural assumptions.
3. Sweep for stale references across `packages/`, `scripts/`, `docs/`, `.pi/`, and `.agents/` and update exact files as needed.
4. If implementation left obvious dead internal references to the pre-planner architecture, clean them up now only when the affected package stays green after the edit.

## Verification
Run all of the following:
- `rg -l "code_brief|code_map|code_relations|code_affected|code_pattern|code_refactor" packages/ scripts/ docs/ .pi/ .agents/ | grep -v '^\.tndm/'`
  - Expected result: only intentional current references remain; there should be no stale assumptions about removed tools or missing mention of `code_refactor` where tool inventories are maintained.
- `pnpm exec biome check packages/supi-code-intelligence packages/supi-lsp packages/supi-tree-sitter packages/supi-code-runtime packages/supi-debug packages/supi-claude-md`
- Re-run the package-scoped test/typecheck commands from Tasks 1-5 for any package whose docs/cleanup step touched source or tests.
- Re-run `RTK_DISABLED=1 pnpm vitest run packages/supi-lsp/__tests__/integration/e2e-smoke.test.ts -v` if that file changed.

## Test exemption rationale
Docs/scripts/skills compatibility cleanup is not practical TDD work, but it has concrete verification commands and must be done only after the tested code changes are green.
