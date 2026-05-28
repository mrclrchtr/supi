# Task 2: [TDD GREEN] Implement code_health tool spec, executor, renderer, routing, and guidance

## Goal

Implement `code_health` tool: spec, executor, markdown renderer. Wire it into the tool registration and planner so task 1 tests pass.

## Files

### New

**`packages/supi-code-intelligence/src/tool/execute-health.ts`**
- Accept params matching `CodeHealthParameters` from `src/workflow/schemas.ts`
- Get LSP service via `getSessionLspService(cwd)` from `@mrclrchtr/supi-lsp/api`
- Get git context via `gatherGitContext(cwd)` from `../git-context.ts`
- Behavior:
  - If `refresh: true`: call `service.recoverDiagnostics({ restartIfStillStale: true })`
  - If `include` contains `diagnostics` or is omitted: collect workspace diagnostic summary via `service.getWorkspaceDiagnosticSummary()`. If `scope` is a file, use `service.fileDiagnostics()`; if `scope` is a directory, filter summary entries to files under that path.
  - If `include` contains `servers`: report LSP server status (use `service.getOutstandingDiagnosticSummary` or the lsp state's server info)
  - If `include` contains `dirty`: report git dirty state
  - `level: "detailed"` shows per-file diagnostics; `"summary"` shows aggregate counts
- Return `CodeIntelResult` with structured details

**`packages/supi-code-intelligence/src/presentation/markdown/health.ts`**
- Render `code_health` results as readable markdown sections
- Sections map to `include` values: Diagnostics, Servers, Dirty Workspace
- Include code action titles where available (from diagnostic data), but do not apply fixes

### Modified

**`packages/supi-code-intelligence/src/tool/tool-specs.ts`**
- Import `CodeHealthParameters` from `../workflow/schemas.ts`
- Add `code_health` entry to `CODE_INTELLIGENCE_TOOL_SPECS`:
  - name: `"code_health"`
  - label: `"Code Health"`
  - description: `"Summarize diagnostics, provider state, and dirty workspace signals."`
  - promptSnippet: `"code_health — diagnostics, server status, and workspace health"`
  - basePromptGuidelines: see guidance section below
  - parameters: `CodeHealthParameters`
  - run: delegates to `executeHealthTool`

**`packages/supi-code-intelligence/src/intent/types.ts`**
- Add `"code_health"` to `CODE_INTELLIGENCE_TOOL_NAMES`

**`packages/supi-code-intelligence/src/analysis/routing/planner.ts`**
- Add route for `"code_health"`: always returns `preferred: "search"` (doesn't require live semantic/structural providers for diagnostics summary; diagnostics come from LSP service directly which is handled in the executor)

**`packages/supi-code-intelligence/src/tool/guidance.ts`**
- Add `code_health` to `INTENT_GUIDELINES`:
  - "Use code_health to check for diagnostics, LSP server status, or dirty workspace state."
  - "Pass `refresh: true` to recover stale diagnostics before checking."
  - "Use `scope` to narrow to a specific file or package."
  - "Use `include` to request specific sections: diagnostics, servers, dirty."

## Implementation notes

- Follow the pattern of `execute-brief.ts`: expand targetId if present, validate params, get provider/route, execute, return result
- `code_health` is primarily diagnostic — it reads state, it doesn't need semantic/structural providers
- Use `getSessionLspService(cwd)` directly (like `prioritization-signals.ts` does)
- For `scope` filtering, use `normalizePath` from `search-helpers.ts` and `isWithinOrEqual` from `@mrclrchtr/supi-core/api`
- For `servers` info, use `lspState` metadata if available — or report "N active LSP servers" from the LSP state

## Verification

```bash
pnpm vitest run packages/supi-code-intelligence/__tests__/unit/code-health-tool.test.ts
```

Task 1 tests must now pass.
