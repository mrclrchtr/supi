# Task 3: Implement LSP semantic substrate adapter

## RED: Write failing test

Create `packages/supi-code-intelligence/__tests__/unit/substrates/lsp-adapter.test.ts`:

- Mock `@mrclrchtr/supi-lsp/api` (`getSessionLspService`, `waitForSessionLspService`)
- Test: `createSemanticSubstrate(cwd)` returns a `SemanticSubstrate` with all 4 methods
- Test: `references()` calls through to LSP service, maps `Location[]` → `CodeLocation[]`
- Test: `references()` returns `null` when LSP is unavailable (not ready, not pending)
- Test: `references()` returns `null` when LSP returns null
- Test: `implementation()` calls through, flattens array-or-single result
- Test: `documentSymbols()` normalizes `DocumentSymbol[]` to `CodeSymbol[]`
- Test: `workspaceSymbols()` normalizes to `CodeSymbol[]`
- Test: `acquire` waits for pending LSP (returns null if still pending after timeout)
- Test: `acquire` returns null when LSP is disabled/inactive

Verify tests fail (no implementation yet).

## GREEN: Implement

Create `packages/supi-code-intelligence/src/substrates/lsp-adapter.ts`:

```ts
export function createSemanticSubstrate(cwd: string): SemanticSubstrate {
  return {
    references: async (file, pos) => { /* acquire + call + map */ },
    implementation: async (file, pos) => { /* acquire + call + flatten array */ },
    documentSymbols: async (file) => { /* acquire + call + flatten */ },
    workspaceSymbols: async (query) => { /* acquire + call + map */ },
  };
}
```

Internal helper: `acquire(cwd)` — calls `getSessionLspService`, waits if `pending`, returns `SessionLspService | null`.

Internal helper: `toCodeLocation(loc)` — identity (LSP Location already has the right shape for `CodeLocation`).

Internal helper: `flattenDocumentSymbols(symbols)` — recursive walk of `DocumentSymbol[]`, returns `CodeSymbol[]` with 1-based line/character.

Internal helper: `toCodeSymbol(sym: SymbolInformation | WorkspaceSymbol)` — extracts name, kind, file, line, character.

Verify tests pass. Run `pnpm vitest run packages/supi-code-intelligence/` to ensure no existing test regressions.
