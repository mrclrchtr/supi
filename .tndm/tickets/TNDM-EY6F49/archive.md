# Archive

## Verification evidence

### Tests
- `pnpm vitest run packages/supi-tree-sitter/` — 159 tests passed
- `pnpm vitest run packages/supi-lsp/__tests__/unit/tool-specs.test.ts packages/supi-lsp/__tests__/unit/guidance.test.ts packages/supi-lsp/__tests__/unit/focused-tools.test.ts` — 34 tests passed
- `pnpm vitest run packages/supi-code-intelligence/__tests__/unit/guidance.test.ts packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts packages/supi-code-intelligence/__tests__/unit/tool-adapters.test.ts` — 30 tests passed
- Cross-package regression sweep: 223 tests passed, 0 failures

### Typecheck
- `pnpm exec tsc --noEmit` — zero errors across all 3 packages (source + tests, 6 tsconfigs)

### Lint
- `pnpm exec biome check` — zero errors across all 3 packages (235 files); only 13 pre-existing warnings (noNonNullAssertion in test files, not introduced by this change)

### Post-review fixes
- All 4 cross-family orchestration bullets now prefix with their owning tool name per pi's prompt-guideline rule
- `lsp_*` wildcard replaced with concrete tool names (lsp_hover, lsp_definition)
- `packages/supi/README.md` updated from single `tree_sitter` to actual 6 `tree_sitter_*` tools

### Doc audit
- `packages/supi-tree-sitter/README.md` — describes 6 split tools, not old multiplexed tool
- `packages/supi-lsp/README.md` — describes 10 split `lsp_*` tools, not `lsp_lookup`/`lsp_refactor`
- `packages/supi-code-intelligence/README.md` — states that installing exposes all three tool families
- `docs/tool-architecture.md` — tree-sitter section references `tool-specs.ts`, ownership/orchestration rule documented
- `packages/supi-tree-sitter/CLAUDE.md` — no stale `action-specs.ts` references
- `packages/supi-lsp/CLAUDE.md` — no stale `lsp_lookup`/`lsp_refactor` references
- `packages/supi/README.md` — `tree_sitter_*` tools listed correctly
