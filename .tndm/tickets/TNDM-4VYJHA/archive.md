# Archive

## Verification Evidence

### Typecheck
- `pnpm typecheck` (full workspace): PASS — zero errors
- supi-lsp source: PASS
- supi-lsp tests: PASS
- supi-code-intelligence source: PASS
- supi-code-intelligence tests: PASS
- meta-package (supi): PASS

### Unit Tests
- `pnpm vitest run packages/supi-lsp/__tests__/unit/`: 337/337 PASS (38 files)
- Including rewritten transport.test.ts: 9/9 PASS

### Integration Tests
- `pnpm vitest run packages/supi-lsp/__tests__/integration/`: 112/112 PASS (7 files)
- TypeScript: 14/14 PASS (typescript-language-server)
- Python: 12/12 PASS (pyright-langserver)
- Bash: 8/8 PASS (bash-language-server)
- Pre-existing cleanup race (Cannot call write after stream destroyed) is harmless

### Consumer Compatibility
- `pnpm vitest run packages/supi-code-intelligence/`: 174/174 PASS (20 files)

### Packaging
- `node scripts/publish.mjs packages/supi-lsp`: Verified OK
- `node scripts/publish.mjs packages/supi`: Verified OK
- vscode-jsonrpc, vscode-languageserver-types, vscode-languageserver-protocol correctly bundled

### Code Review Findings Fixed
- #1: Timeouts now use CancellationTokenSource + Promise.race with timer cleanup
- #2: JsonRpcRequestError is now a ResponseError alias preserving JSON-RPC error codes

### Documentation
- Updated packages/supi-lsp/CLAUDE.md: Key files section mentions vscode packages and server-config.ts; Architecture gotchas section adds transport wrapper note
