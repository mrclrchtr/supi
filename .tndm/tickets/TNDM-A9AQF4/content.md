# Remove lsp_*/tree_sitter_* from public tool surface + implement code_health

## Goal

Phase 1.5 of the code-only public surface migration. Remove substrate tool registration from the public surface while keeping LSP and tree-sitter as library substrates. Implement `code_health` to replace `lsp_diagnostics` + `lsp_recover`.

## Background

The V2 workflow skeleton (`src/workflow/`) defines 8 planned tools across 6 phases. Only `code_resolve` (Phase 1) is activated. The current public surface still includes all 10 `lsp_*` and 6 `tree_sitter_*` tools, creating ~25 total tools when the design targets ~10.

The existing `code_*` tools already wrap the key substrate capabilities:

| Substrate tool | Replacement |
|---|---|
| `lsp_hover`, `lsp_definition` | `code_resolve` (anchored), `code_brief` (anchored) |
| `lsp_references` | `code_references` |
| `lsp_implementation` | `code_implementations` |
| `lsp_document_symbols` | `code_brief(file)` — already provides outline + imports + exports |
| `lsp_workspace_symbols` | `code_resolve(query)`, `code_brief(symbol)` |
| `lsp_diagnostics` | `code_health` (to implement) |
| `lsp_rename` | `code_refactor_plan` |
| `lsp_code_actions` | Not absorbed yet — non-goal for this phase |
| `lsp_recover` | `code_health({ refresh: true })` |
| `tree_sitter_outline` | `code_brief(file)` |
| `tree_sitter_imports` | `code_brief(file)` |
| `tree_sitter_exports` | `code_brief(file)` |
| `tree_sitter_node_at` | Not absorbed yet — minor gap |
| `tree_sitter_query` | Explicitly dropped from public surface per design |
| `tree_sitter_callees` | `code_calls` |

## Changes

### 1. Remove substrate tool registration from extension wiring

- `src/code-intelligence.ts`: remove `registerLspTools(pi, ...)` call and its import
- `src/tree-sitter/session-lifecycle.ts`: remove `registerTsTools(pi, ...)` call and its import
- Keep `lsp/register-tools.ts`, `tree-sitter/register-tools.ts`, `lsp/tool-actions.ts`, `tree-sitter/tool-actions.ts` as library code — they may be useful for tests or internal use
- Keep all LSP/tree-sitter lifecycle controllers, settings, diagnostic injection, and workspace recovery

### 2. Clean up guidance that references substrate tools

- `src/tool/guidance.ts`: remove all `lsp_*` and `tree_sitter_*` cross-references from `INTENT_GUIDELINES`
- Replace with references to appropriate `code_*` tools

### 3. Implement `code_health`

New tool that replaces `lsp_diagnostics` + `lsp_recover`:

**Schema** (already defined in `src/workflow/schemas.ts`):
- `scope?` — filter to a path/package
- `refresh?` — run recovery/refresh before collecting
- `include?` — sections: diagnostics, servers, dirty, coverage, unused
- `level?` — summary vs detailed

**New files:**
- `src/tool/execute-health.ts` — executor using `getSessionLspService()` from supi-lsp and `gatherGitContext()` from git-context.ts
- `src/presentation/markdown/health.ts` — markdown renderer

**Modified files:**
- `src/tool/tool-specs.ts` — add `code_health` spec
- `src/intent/types.ts` — add `code_health` to tool names
- `src/analysis/routing/planner.ts` — add `code_health` route (diagnostics, no semantic/structural requirement)
- `src/tool/guidance.ts` — add `code_health` guidelines

### 4. Update tests

- `__tests__/unit/extension-registration.test.ts`: remove substrate tool registration assertions, update count, add `code_health` test
- `__tests__/unit/planner-routing.test.ts`: add `code_health` route test (if applicable)
- New: `__tests__/unit/code-health-tool.test.ts` — basic registration + execution test

### 5. Update CLAUDE.md

- Remove "Do not remove public lsp_* or tree_sitter_* tools until..." note
- Add `code_health` to public tool contracts
- Update tool count

## Constraints

- Do NOT remove LSP/tree-sitter lifecycle controllers or service layers
- Do NOT delete `lsp/register-tools.ts` or `tree-sitter/register-tools.ts` — keep as library code
- Do NOT implement code_action application
- code_health does NOT need to support `include: ["coverage", "unused"]` in this phase — those are nice-to-have and can be deferred
- Start with `include: ["diagnostics", "servers", "dirty"]` as the implemented set

## Verification

- All existing tests pass
- New code_health tests pass
- `code_brief(file)` still provides outline + imports + exports + diagnostics (it uses the LSP service directly, not the lsp_* tool)
- `code_references`, `code_calls`, `code_implementations`, `code_refactor_plan`/`code_refactor_apply` continue to work
- `/ci-status` still works (it uses LSP state directly)
- TypeScript compilation passes
- Biome passes
