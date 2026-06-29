## Summary

Close the two documented absorption gaps from Phase 1.5: code action suggestions and stale CLAUDE.md hover documentation.

## Discovery

**lsp_hover → code_brief anchored mode**: Already fully implemented. The `SemanticProvider.hover?()` → `CodeProvider.hover()` → `gatherTreeSitterContext()` → `## Hover` render chain exists and works (best-effort). The CLAUDE.md still says "Phase 2" for this — just needs a doc update.

**lsp_code_actions → code_health detailed output**: Not yet absorbed. `SessionLspService` already has `codeActions()` and `getOutstandingDiagnostics()` methods, and `SemanticProvider` already has `codeActions?()`. The gap is in `code_health`'s executor and renderer — they only collect diagnostic counts, not positions needed for code action queries.

## Changes

### Files to modify

1. **`packages/supi-code-intelligence/src/presentation/markdown/health.ts`**
   - Extend `HealthData` interface with optional `codeActions` field
   - Add `CodeActionSuggestion` type: `{ file: string; line: number; title: string; kind?: string }`
   - Render code action suggestions as a subsection under detailed diagnostics

2. **`packages/supi-code-intelligence/src/tool/execute-health.ts`**
   - When `level: "detailed"` and diagnostics are included, use `service.getOutstandingDiagnostics(1)` to get full diagnostic entries with positions
   - For each diagnostic at severity 1 (error), query `service.codeActions(file, position)`
   - Collect unique action titles per file (deduplicate by title)
   - Limit to first 5 files or 10 total actions to avoid excessive LSP calls
   - Pass collected actions to the renderer

3. **`packages/supi-code-intelligence/CLAUDE.md`**
   - Update absorption gaps: mark `lsp_hover` as absorbed (already in Phase 1.5)
   - Update absorption gaps: mark `lsp_code_actions` as absorbed (code_health detailed mode)
   - Remove the "Known absorption gaps" section if both are resolved

4. **`packages/supi-code-intelligence/__tests__/unit/code-health-tool.test.ts`**
   - Add test for code action collection when `level: "detailed"`
   - Add test for code action rendering in health output

## Verification

- `code_health` with `level: "detailed"` on a file with LSP errors shows code action titles
- `code_health` with `level: "summary"` does NOT show code actions (avoids unnecessary LSP calls)
- Existing code_health tests continue to pass
- CLAUDE.md accurately reflects absorption status
- TypeScript compiles clean
