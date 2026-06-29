# Task 8: Final verification — code-intelligence hardening sweep

## Goal
Prove the assembled hardening change works end-to-end across the touched packages and that the code-only public surface is internally consistent after all tasks land.

## Files
- `packages/supi-code-intelligence/**`
- `packages/supi-claude-md/**`
- `packages/supi-tree-sitter/README.md`
- `packages/supi-tree-sitter/CLAUDE.md`

## Change
Do not introduce new code in this task. Run the full verification sweep for the completed work:
- full package-level tests for `supi-code-intelligence` and `supi-claude-md`
- typecheck for both touched TypeScript packages and their tests
- a focused Biome check on the touched packages/docs
- a final wording audit confirming no stale public-surface references remain where this ticket changed docs/behavior

## Verification
Run:

```bash
RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/ packages/supi-claude-md/

RTK_DISABLED=1 pnpm exec tsc -b \
  packages/supi-code-intelligence/tsconfig.json \
  packages/supi-code-intelligence/__tests__/tsconfig.json \
  packages/supi-claude-md/tsconfig.json \
  packages/supi-claude-md/__tests__/tsconfig.json

pnpm exec biome check \
  packages/supi-code-intelligence \
  packages/supi-claude-md \
  packages/supi-tree-sitter/README.md \
  packages/supi-tree-sitter/CLAUDE.md

rg -n "startsWith\(\"lsp_|startsWith\(\"tree_sitter_|activate the `tree_sitter_\\*` tool family|After install, pi gets \*\*6 focused tools\*\*" \
  packages/supi-code-intelligence \
  packages/supi-claude-md \
  packages/supi-tree-sitter/README.md \
  packages/supi-tree-sitter/CLAUDE.md
```

Expected result:
- tests pass
- typecheck passes
- Biome reports no diagnostics for the touched surface
- the final `rg` command returns no stale public-surface matches in the touched files

## Test mode
Verification-only final gate. This task confirms the whole change works end-to-end and must be the last task completed.
