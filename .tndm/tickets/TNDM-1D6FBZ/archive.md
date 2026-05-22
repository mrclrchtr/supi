# Archive

## Archive verification

### Plan/task status
- Reviewed ticket `TNDM-1D6FBZ` via `supi_tndm_cli show` and `.tndm/tickets/TNDM-1D6FBZ/content.md`.
- Reviewed structured task list via `supi_tndm_cli task_list`.
- All 5 planned tasks are marked `done`.
- Reviewed the actual delta with fresh `git status --short` and `git diff --stat` before closeout.

### Fresh verification evidence
Ran fresh from the repo root:

```bash
bash -n scripts/check-supi-container-load
pnpm exec biome check --max-diagnostics=20 README.md packages/supi/README.md docs/tool-architecture.md docs/benchmarking-terminal-bench.md packages/supi-code-intelligence packages/supi-lsp packages/supi-debug packages/supi-claude-md
pnpm exec tsc --noEmit -p packages/supi-code-intelligence/tsconfig.json
pnpm exec tsc --noEmit -p packages/supi-code-intelligence/__tests__/tsconfig.json
pnpm exec tsc --noEmit -p packages/supi-lsp/tsconfig.json
pnpm exec tsc --noEmit -p packages/supi-lsp/__tests__/tsconfig.json
pnpm exec tsc --noEmit -p packages/supi-debug/tsconfig.json
pnpm exec tsc --noEmit -p packages/supi-debug/__tests__/tsconfig.json
pnpm exec tsc --noEmit -p packages/supi-claude-md/tsconfig.json
pnpm exec tsc --noEmit -p packages/supi-claude-md/__tests__/tsconfig.json
pnpm vitest run packages/supi-code-intelligence/ packages/supi-lsp/__tests__/integration/e2e-smoke.test.ts packages/supi-debug/__tests__/unit/index.test.ts packages/supi-claude-md/__tests__/unit/skill-references-sync.test.ts -v
```

Observed results:
- `bash -n scripts/check-supi-container-load` passed.
- `biome check` passed for the touched docs and the affected packages.
- All listed `tsc --noEmit` source and test projects passed.
- `vitest` passed: **23 files / 241 tests passed**.

### Targeted doc/surface accuracy checks
Ran fresh stale-surface search:

```bash
rg -n 'code_intel|code_intel brief' README.md packages/supi/README.md docs/tool-architecture.md docs/benchmarking-terminal-bench.md scripts/check-supi-container-load packages/supi-code-intelligence/src packages/supi-lsp/src packages/supi-lsp/__tests__/integration/e2e-smoke.test.ts packages/supi-debug/src packages/supi-claude-md/skills -g'*.ts' -g'*.md' -g'*'
```

Result:
- No output; `rg` exited with status `1`, confirming no remaining stale `code_intel` / `code_intel brief` references in the checked final surfaces.

### Implementation vs approved intent
Confirmed the final tree matches the approved clean-break plan:
- Public code-intelligence surface is the focused five-tool split:
  - `code_brief`
  - `code_map`
  - `code_relations`
  - `code_affected`
  - `code_pattern`
- Legacy `code_intel` multiplexer files were removed from `packages/supi-code-intelligence/src/`.
- Non-search flows return substrate-backed results or explicit `unavailable`/disambiguation states; no non-search heuristic fallback remains.
- `code_pattern` remains the only heuristic/search-oriented tool.
- `code_map` remains directory-only and factual.
- Downstream references were updated across `supi-lsp`, `supi-debug`, `supi-claude-md`, root/package READMEs, `docs/tool-architecture.md`, `docs/benchmarking-terminal-bench.md`, and `scripts/check-supi-container-load`.

### Notes on final closeout fixes
The final archive pass also re-verified the last review-driven adjustments:
- `code_brief` symbol input now resolves to a real symbol-focused brief instead of falling back to a project brief.
- Anchored `code_affected` follow-up guidance now uses `file` + `line` + `character` when no real symbol name is known.
- `supi-claude-md` bundled skill references no longer instruct agents to use removed `code_intel brief` guidance.
- `scripts/check-supi-container-load` now checks the split LSP and focused code-intelligence tool names.

No manual verification claims are being archived beyond the fresh command evidence above.
