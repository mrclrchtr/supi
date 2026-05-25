# Archive

## Fresh verification evidence

### Task 1 — shared broker and refactor-capable runtime contracts (`supi-code-runtime`)
Command:
```bash
RTK_DISABLED=1 pnpm vitest run packages/supi-code-runtime/__tests__/unit/capability-broker.test.ts packages/supi-code-runtime/__tests__/unit/workspace-runtime.test.ts -v && pnpm exec tsc -b packages/supi-code-runtime/tsconfig.json packages/supi-code-runtime/__tests__/tsconfig.json && pnpm exec biome check packages/supi-code-runtime
```
Result:
- Vitest: 2 files passed, 30 tests passed
- TypeScript build: passed
- Biome: passed (`Checked 12 files`)

### Task 2 — semantic + optional refactor capability publication (`supi-lsp`)
Command:
```bash
RTK_DISABLED=1 pnpm vitest run packages/supi-lsp/__tests__/unit/refactor-provider.test.ts packages/supi-lsp/__tests__/unit/runtime-registration.test.ts packages/supi-lsp/__tests__/unit/semantic-provider.test.ts -v && pnpm exec tsc -b packages/supi-lsp/tsconfig.json packages/supi-lsp/__tests__/tsconfig.json && pnpm exec biome check packages/supi-lsp
```
Result:
- Vitest: 3 files passed, 30 tests passed
- TypeScript build: passed
- Biome: passed (`Checked 119 files`)

### Task 3 — structural capability publication (`supi-tree-sitter`)
Command:
```bash
RTK_DISABLED=1 pnpm vitest run packages/supi-tree-sitter/__tests__/unit/provider.test.ts packages/supi-tree-sitter/__tests__/unit/runtime-registration.test.ts -v && pnpm exec tsc -b packages/supi-tree-sitter/tsconfig.json packages/supi-tree-sitter/__tests__/tsconfig.json && pnpm exec biome check packages/supi-tree-sitter
```
Result:
- Vitest: 2 files passed, 19 tests passed
- TypeScript build: passed
- Biome: passed (`Checked 74 files`)

### Task 4 — shared planner behind existing read-only `code_*` tools (`supi-code-intelligence`)
Command:
```bash
RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts packages/supi-code-intelligence/__tests__/unit/tool-adapters.test.ts packages/supi-code-intelligence/__tests__/unit/planner-routing.test.ts packages/supi-code-intelligence/__tests__/integration/fallback-chain.test.ts -v && pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json packages/supi-code-intelligence/__tests__/tsconfig.json && pnpm exec biome check packages/supi-code-intelligence
```
Result:
- Vitest: 4 files passed, 45 tests passed
- TypeScript build: passed
- Biome: passed (`Checked 85 files`)

### Task 5 — `code_refactor` direct-apply refactor path
Command:
```bash
RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/__tests__/unit/refactor-tool.test.ts packages/supi-code-intelligence/__tests__/unit/refactor-safety.test.ts packages/supi-code-intelligence/__tests__/unit/apply-workspace-edit.test.ts -v && RTK_DISABLED=1 pnpm vitest run packages/supi-lsp/__tests__/integration/e2e-smoke.test.ts -v && pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json packages/supi-code-intelligence/__tests__/tsconfig.json packages/supi-lsp/tsconfig.json packages/supi-lsp/__tests__/tsconfig.json && pnpm exec biome check packages/supi-code-intelligence packages/supi-lsp
```
Result:
- Code-intelligence Vitest: 3 files passed, 25 tests passed
- LSP e2e smoke: 1 file passed, 46 tests passed
- TypeScript build: passed
- Biome: passed (`Checked 204 files`)

### Task 6 — docs / scripts / status-log compatibility sweep
Commands:
```bash
rg -n "lsp_lookup|lsp_refactor" scripts/check-supi-container-load docs/benchmarking-terminal-bench.md || true
rg -n "code_refactor|tree_sitter_\*|lsp_hover|lsp_definition|lsp_references|tree_sitter_outline" scripts/check-supi-container-load docs/benchmarking-terminal-bench.md docs/tool-architecture.md packages/supi-debug/src/status-log.ts packages/supi-code-intelligence/README.md packages/supi-code-intelligence/CLAUDE.md packages/supi-lsp/__tests__/integration/e2e-smoke.test.ts
pnpm exec biome check packages/supi-debug packages/supi-claude-md docs scripts
```
Result:
- No stale `lsp_lookup` / `lsp_refactor` references remained in the verified docs/script targets
- Verified current `code_refactor`, split LSP tools, and focused `tree_sitter_*` tool references in:
  - `scripts/check-supi-container-load`
  - `docs/benchmarking-terminal-bench.md`
  - `docs/tool-architecture.md`
  - `packages/supi-debug/src/status-log.ts`
  - `packages/supi-code-intelligence/README.md`
  - `packages/supi-code-intelligence/CLAUDE.md`
  - `packages/supi-lsp/__tests__/integration/e2e-smoke.test.ts`
- Biome: passed (`Checked 49 files`)

### Task 7 — post-verification safety / path / planner / compatibility fixes
Command:
```bash
RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/__tests__/unit/apply-workspace-edit.test.ts packages/supi-code-intelligence/__tests__/unit/refactor-safety.test.ts packages/supi-code-intelligence/__tests__/unit/refactor-tool.test.ts packages/supi-code-intelligence/__tests__/unit/planner-routing.test.ts -v && RTK_DISABLED=1 pnpm vitest run packages/supi-lsp/__tests__/integration/e2e-smoke.test.ts -v && pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json packages/supi-code-intelligence/__tests__/tsconfig.json packages/supi-lsp/tsconfig.json packages/supi-lsp/__tests__/tsconfig.json && pnpm exec biome check packages/supi-code-intelligence packages/supi-lsp
```
Result:
- Planner / refactor safety / apply / refactor execution Vitest: 4 files passed, 37 tests passed
- LSP e2e smoke: 1 file passed, 46 tests passed
- TypeScript build: passed
- Biome: passed (`Checked 204 files`)

## Code / doc spot checks
- Verified `packages/supi-code-runtime/src/workspace/runtime.ts` exposes `semantic.refactorAvailable` and no third broker slot.
- Verified `packages/supi-code-intelligence/src/tool/execute-refactor.ts` resolves `file` with `normalizePath(params.file, ctx.cwd)` before calling the semantic provider.
- Verified `packages/supi-code-intelligence/src/refactor/apply-workspace-edit.ts` now validates file-backed bounds first, precomputes all transformed contents, and rolls back already-written files on commit failure.
- Verified `scripts/check-supi-container-load` now checks the current split LSP tools and focused `tree_sitter_*` tools rather than stale mega-tool names.
- Verified `packages/supi-code-intelligence/README.md` architecture section now describes the shared workspace broker + planner model.

## Archive conclusion
Implementation matches the planned scope after the post-verification Task 7 fixes. All tasks are complete, fresh verification passed, and the affected docs/scripts were updated to match the final code.
