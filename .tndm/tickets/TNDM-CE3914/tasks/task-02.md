# Task 2: Add LSP code action queries to code_health detailed mode

## Goal

When `code_health` is called with `level: "detailed"` and diagnostics are included, query LSP code actions for files with severity-1 (error) diagnostics and pass them to the renderer.

## Files

- `packages/supi-code-intelligence/src/tool/execute-health.ts`

## Changes

1. Import `CodeActionSuggestion` from the health renderer.

2. In `collectDiagnostics` (or a new helper), when `level === "detailed"` and `included.includes("diagnostics")`:
   - Use `service.getOutstandingDiagnostics(1)` instead of `service.getWorkspaceDiagnosticSummary()` to get full `Diagnostic[]` entries with positions
   - For the first error diagnostic in each file, call `service.codeActions(file, position)`
   - Collect titles from the returned `CodeAction[]` (use `action.title`)
   - Deduplicate by title within each file
   - Limit to first 5 files and max 10 total action suggestions

3. Return code actions alongside diagnostics in the `HealthData` payload.

4. Keep `level: "summary"` behavior unchanged — no code action queries (avoids unnecessary LSP calls).

5. Handle errors gracefully: if `service.codeActions()` throws or returns null, skip that file.

## Verification

- `code_health { level: "detailed" }` shows code action titles for files with errors
- `code_health { level: "summary" }` does NOT show code actions
- When LSP is unavailable, no code actions shown (no crash)
- TypeScript compiles clean
