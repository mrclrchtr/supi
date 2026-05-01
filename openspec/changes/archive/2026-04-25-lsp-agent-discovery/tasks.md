## 1. LspClient: Workspace Symbol Support

- [x] 1.1 Add `workspaceSymbol(query: string)` method to `LspClient` in `packages/supi-lsp/client.ts`
- [x] 1.2 Add `WorkspaceSymbol` / `SymbolInformation` types to `packages/supi-lsp/types.ts` if not present
- [x] 1.3 Handle server capability check (`workspaceSymbolProvider`) in `workspaceSymbol()`
- [x] 1.4 Add unit tests for `workspaceSymbol()` (exact match, fuzzy match, unsupported server)

## 2. Tool Actions: New Actions

- [x] 2.1 Add `workspace_symbol`, `search`, and `symbol_hover` to `LspActionEnum` in `packages/supi-lsp/lsp.ts`
- [x] 2.2 Add `handleWorkspaceSymbol()` action handler in `packages/supi-lsp/tool-actions.ts`
- [x] 2.3 Add `handleSearch()` action handler — chains `workspace_symbol` → `grep` fallback in `packages/supi-lsp/tool-actions.ts`
- [x] 2.4 Add `handleSymbolHover()` action handler — resolves symbol via `workspace_symbol`, then `hover` in `packages/supi-lsp/tool-actions.ts`
- [x] 2.5 Update `lspToolDescription` to document new actions
- [x] 2.6 Add unit tests for new action handlers

## 3. Diagnostic Augmentation

- [x] 3.1 Create `packages/supi-lsp/diagnostic-augmentation.ts` with `augmentDiagnostics(filePath, diags, manager, cwd)` function
- [x] 3.2 Implement hover fetch at first severity-1 error position with 500ms timeout
- [x] 3.3 Implement code_actions fetch at first severity-1 error position with 500ms timeout
- [x] 3.4 Format augmentation text (hover truncated to 3 lines, code action titles listed)
- [x] 3.5 Wire augmentation into `appendInlineDiagnostics()` in `packages/supi-lsp/overrides.ts`
- [x] 3.6 Add unit tests for `augmentDiagnostics()` (with hover, with code_actions, timeout, no errors)

## 4. Formatting

- [x] 4.1 Add `formatWorkspaceSymbols()` to `packages/supi-lsp/format.ts` for symbol list rendering
- [x] 4.2 Add `formatSearchResults()` to `packages/supi-lsp/format.ts` for combined LSP + grep results
- [x] 4.3 Add unit tests for new formatters

## 5. Documentation & Cleanup

- [x] 5.1 Update `packages/supi-lsp/CLAUDE.md` with new actions and diagnostic augmentation behavior
- [x] 5.2 Run `pnpm typecheck` and fix errors
- [x] 5.3 Run `pnpm exec biome check --write packages/supi-lsp/` and fix issues
- [x] 5.4 Run `pnpm exec vitest run packages/supi-lsp/__tests__/` and ensure tests pass
