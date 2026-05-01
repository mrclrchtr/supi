## Why

The `lsp` tool is precise but requires exact `(file, line, character)` coordinates. During implementation, agents default to `grep` and `read` for type exploration because LSP doesn't support fuzzy symbol search or name-based resolution. Additionally, when inline diagnostics appear after `write`/`edit`, agents don't see LSP-powered suggestions (hover info, code actions) that could guide fixes. This change bridges exploration and editing modes without prompt nudges.

## What Changes

- **New**: `workspace_symbol` action on the `lsp` tool — fuzzy symbol search across the project, returning file/line/character for each match
- **New**: `search` action on the `lsp` tool — tries `workspace_symbol` first, falls back to `grep`-style text search
- **New**: Augmented diagnostics in `overrides.ts` — after `write`/`edit`, when severity-1 errors exist, silently fetch `hover` + `code_actions` at the first error position and append to the diagnostic message
- **New**: Symbol-name hover — an `lsp` tool action that accepts a `symbol` parameter, resolves it via `workspace_symbol`, then returns `hover` info (zero coordinates)
- **Modified**: `LspActionEnum` in `lsp.ts` gains `workspace_symbol`, `search`, and `symbol_hover`
- **Modified**: `LspClient` gains `workspaceSymbol(query)` method

## Capabilities

### New Capabilities
- `lsp-workspace-symbol`: Workspace symbol search via `workspace/symbol` LSP request, returning symbol name, kind, location, and container name for fuzzy-matched results.
- `lsp-diagnostic-augmentation`: Silent LSP hover and code_actions appended to inline diagnostics after write/edit tool results, teaching the agent LSP exists by showing it working.

### Modified Capabilities
- `lsp-tool`: Add `workspace_symbol`, `search`, and `symbol_hover` actions to the existing `lsp` tool definition and execute dispatcher.

## Impact

- **supi-lsp**: New `workspaceSymbol()` in `client.ts`, new action handlers in `tool-actions.ts`, augmented diagnostic logic in `overrides.ts`, enum expansion in `lsp.ts`.
- **supi-lsp/CLAUDE.md**: Document new actions and augmented diagnostics behavior.
- **Tests**: Unit tests for `workspaceSymbol` response formatting, integration tests for diagnostic augmentation, action handler tests for `search` and `symbol_hover`.
