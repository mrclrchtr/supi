# Migrate supi-lsp to vscode-languageserver-node packages

## Goal

Replace custom LSP types and JSON-RPC transport in `packages/supi-lsp/` with the three official `vscode-languageserver-node` packages: `vscode-jsonrpc`, `vscode-languageserver-types`, `vscode-languageserver-protocol`.

## Approach

Full migration (types + transport) in three phases:
1. **Deps + scaffolding** — add npm packages, create migration shims
2. **Types replacement** — replace `config/types.ts` with `vscode-languageserver-types` + `vscode-languageserver-protocol`
3. **Transport replacement** — replace `client/transport.ts` with `vscode-jsonrpc`

## What gets deleted
- `config/types.ts` (~350 lines) — custom Position, Range, Diagnostic, Hover, SymbolKind, CodeAction, all protocol interfaces, JSON-RPC types
- `client/transport.ts` (~170 lines) — custom Content-Length framing, request/response correlation, timeouts, partial-message buffering

## What stays the same
- `LspClient` public API surface
- `LspManager` and all manager helpers
- Diagnostic pipeline (push + pull), cascade detection, stale diagnostics
- All tool implementations, guidance, settings, overrides, renderer
- `SessionLspService` and the public registry
- `ServerConfig` / `LspConfig` types (our own, not LSP spec — move to separate file)

## Key risks
- `SymbolKind` and `DiagnosticSeverity` change from `const` object to numeric enum — same values, different TS representation
- `src/api.ts` re-exports types to `supi-code-intelligence` — must maintain compatibility
- Transport behavioral change — vscode-jsonrpc handles framing/connection differently
- 25+ files import from `../config/types.ts` — all need import path updates

## Dependencies to add
```
vscode-jsonrpc: ^9.0.0
vscode-languageserver-types: ^3.17.5
vscode-languageserver-protocol: ^3.17.5
```

All three must be in `dependencies` + `bundledDependencies` in `packages/supi-lsp/package.json`.

## Verification
- `pnpm typecheck` across workspace
- Unit tests: transport.test.ts, client.integration.test.ts, manager.integration.test.ts
- Integration: TypeScript/Python/Bash full lifecycle tests
- `supi-code-intelligence` tests for API compatibility
- `pnpm pack:check` to verify bundled dependency layout
