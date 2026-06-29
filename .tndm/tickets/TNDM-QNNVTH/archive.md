# Archive

## Archive verification

### Ticket
- Ticket: `TNDM-QNNVTH`
- Title: **Harden active code intelligence public surface**
- All 8 planned tasks are marked done.

### Fresh verification evidence

#### Regression and follow-up coverage present
Ran:
```bash
rg -n 'uses a symbol-resolved targetId for callee follow-up|falls back to the workspace-symbol anchor when document symbols have multiple exact matches|falls back to the workspace-symbol anchor when the refined document symbol is rangeless|falls back to the workspace-symbol anchor when document symbol lookup throws|falls back to the workspace-symbol anchor when document symbol lookup is empty|renders a real coverage section when coverage is requested|renders a real unused section when unused is requested|reports missing coverage and unused artifacts explicitly when requested|extracts file from an active code tool|extracts path from a code tool that accepts path inputs|reports only the active code_\* tool surface|include: \["coverage"\]|coverage, unused' \
  packages/supi-code-intelligence/__tests__/unit/code-resolve-tool.test.ts \
  packages/supi-code-intelligence/__tests__/unit/workflow-target-store.test.ts \
  packages/supi-code-intelligence/__tests__/unit/target-resolution.test.ts \
  packages/supi-code-intelligence/__tests__/unit/code-health-tool.test.ts \
  packages/supi-claude-md/__tests__/unit/discovery.test.ts \
  packages/supi-code-intelligence/__tests__/unit/code-intelligence-status-command.test.ts \
  packages/supi-code-intelligence/src/tool/tool-specs.ts
```
Result:
- exit code `0`
- confirmed presence of the targetId fidelity regression test, isolated `resolveSymbolTarget` fallback tests, code_health coverage/unused tests, discovery and `/ci-status` tests, and updated `code_health` prompt-surface strings in `tool-specs.ts`.

#### Package test sweep
Ran:
```bash
RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/ packages/supi-claude-md/
```
Result:
- exit code `0`
- **53 passed | 2 skipped** test files
- **473 passed | 4 skipped** tests

This fresh suite covers the implemented workstreams:
- Task 1–2: targetId fidelity and graph follow-up behavior
- Task 3–4: truthful `code_health` include behavior, coverage, unused reporting
- Task 5–6: discovery path extraction and `/ci-status` code-only surface behavior
- review follow-up coverage for `code_health` prompt guidance and isolated `resolveSymbolTarget` fallback behavior

#### Typecheck
Ran:
```bash
RTK_DISABLED=1 pnpm exec tsc -b \
  packages/supi-code-intelligence/tsconfig.json \
  packages/supi-code-intelligence/__tests__/tsconfig.json \
  packages/supi-claude-md/tsconfig.json \
  packages/supi-claude-md/__tests__/tsconfig.json
```
Result:
- exit code `0`
- TypeScript build and test configs stayed clean for both touched packages.

#### Biome
Ran:
```bash
pnpm exec biome check \
  packages/supi-code-intelligence \
  packages/supi-claude-md \
  packages/supi-tree-sitter/README.md \
  packages/supi-tree-sitter/CLAUDE.md
```
Result:
- exit code `0`
- no diagnostics after formatting/import-order fixes.

#### Stale public-surface audit
Ran:
```bash
rg -n 'startsWith\("lsp_|startsWith\("tree_sitter_|activate the `tree_sitter_\\*` tool family|After install, pi gets \*\*6 focused tools\*\*' \
  packages/supi-code-intelligence \
  packages/supi-claude-md \
  packages/supi-tree-sitter/README.md \
  packages/supi-tree-sitter/CLAUDE.md
```
Result:
- exit code `1`
- expected no-match result; no stale public-surface references remained in the touched files.

### Docs review and verification
Reviewed the real delta, including the staged implementation changes:
```bash
git status --short
git diff --cached --stat -- . ':(exclude).tndm'
git diff --cached -- packages/supi-code-intelligence/README.md packages/supi-code-intelligence/CLAUDE.md packages/supi-tree-sitter/README.md packages/supi-tree-sitter/CLAUDE.md
```
Observed staged product delta across 18 non-ticket files, including:
- `packages/supi-code-intelligence/README.md`
- `packages/supi-code-intelligence/CLAUDE.md`
- `packages/supi-tree-sitter/README.md`
- `packages/supi-tree-sitter/CLAUDE.md`

Verified docs-to-code consistency with:
```bash
rg -n 'include\?|coverage|unused|code_health' \
  packages/supi-code-intelligence/README.md \
  packages/supi-code-intelligence/CLAUDE.md \
  packages/supi-code-intelligence/src/tool/tool-specs.ts \
  packages/supi-code-intelligence/src/tool/execute-health.ts \
  packages/supi-code-intelligence/src/presentation/markdown/health.ts

rg -n 'library-only|StructuralProvider|Public tool registration|public tool registration|provider/tree-sitter-provider' \
  packages/supi-tree-sitter/README.md \
  packages/supi-tree-sitter/CLAUDE.md \
  packages/supi-tree-sitter/package.json \
  packages/supi-tree-sitter/src/provider/tree-sitter-provider.ts
```
Result:
- exit code `0`
- `code_health` docs match the final implementation (`diagnostics`, `servers`, `dirty`, `coverage`, `unused`, explicit missing-report behavior)
- `supi-tree-sitter` docs match the final library-only substrate model and real provider export path
- no additional doc edits were required during archive beyond the docs already updated during implementation.

### Task-by-task completion summary
- **Task 1–2**: targetId fidelity is covered by the added regression test plus green package suite; graph output now retains symbol identity and stronger semantic anchors when available.
- **Task 3–4**: `code_health` now honors `include`, exposes real `coverage` / `unused` sections, and reports missing artifacts explicitly; covered by fresh tests, typecheck, and docs consistency check.
- **Task 5–6**: `supi-claude-md` discovery recognizes active `code_*` file/path inputs and `/ci-status` lists only the code-only public surface; covered by fresh tests.
- **Task 7**: tree-sitter docs were verified as library-only and free of stale `tree_sitter_*` public-activation wording.
- **Task 8**: full package tests, typecheck, Biome, stale-surface audit, and docs verification all passed fresh.

### Conclusion
The change matches the approved design: the active `code_*` public surface is internally consistent, `code_health` is truthful about requested sections, adjacent behavior/docs reflect the code-only public model, and the review follow-up items were applied and verified.
