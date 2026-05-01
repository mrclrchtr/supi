## 1. Diagnostic Cache Metadata

- [ ] 1.1 Change `LspClient` diagnostic storage to keep diagnostics with `receivedAt` and optional `version` metadata while preserving `getDiagnostics()` and `getAllDiagnostics()` return shapes.
- [ ] 1.2 Track current synced document versions for open documents and compare them when handling versioned `publishDiagnostics` notifications.
- [ ] 1.3 Ignore delayed `publishDiagnostics` notifications whose version is older than the currently synced open document version.
- [ ] 1.4 Add unit tests for versioned diagnostic storage, unversioned replacement behavior, and ignored older publications.

## 2. Bounded Open-Document Refresh

- [ ] 2.1 Add a client-level method to re-read/re-sync all currently open existing documents and wait for diagnostics to settle using `maxWaitMs` and `quietMs`.
- [ ] 2.2 Add a manager-level `refreshOpenDiagnostics()` method that invokes the client refresh across active clients and soft-fails on LSP or filesystem errors.
- [ ] 2.3 Ensure deleted open files are closed and removed from diagnostic cache during refresh/pruning.
- [ ] 2.4 Add tests for quick settle, timeout fallback, and deleted-file refresh behavior.

## 3. Pre-Turn Diagnostic Context Integration

- [ ] 3.1 Call the manager refresh from `before_agent_start` before diagnostic summary/detail generation and fingerprinting.
- [ ] 3.2 Keep diagnostic context injection skipped when refreshed diagnostics are empty or unchanged after fingerprinting.
- [ ] 3.3 Ensure refresh timeouts or failures do not prevent `before_agent_start` from returning normally.
- [ ] 3.4 Update `before_agent_start` tests to verify refresh happens before summary reads and fingerprint deduplication uses refreshed content.

## 4. LSP 3.17 Capability Preparation

- [ ] 4.1 Add `textDocument.publishDiagnostics.versionSupport: true` to client capabilities.
- [ ] 4.2 Extend protocol types for `diagnosticProvider` and the minimal LSP 3.17 diagnostic pull report shapes needed by the client.
- [ ] 4.3 Implement capability-gated `textDocument/diagnostic` refresh support if server capabilities expose `diagnosticProvider`, including full reports and related document full reports.
- [ ] 4.4 Fall back to push-diagnostic settling when pull diagnostics are unsupported, fail, are cancelled, or time out.
- [ ] 4.5 Add tests for capability advertisement and pull-diagnostic fallback behavior.

## 5. Verification

- [ ] 5.1 Run focused `supi-lsp` tests covering client, manager, and `before_agent_start` behavior.
- [ ] 5.2 Run `pnpm exec biome check --write packages/supi-lsp openspec/changes/refresh-lsp-diagnostics-before-agent-start` and review any changes.
- [ ] 5.3 Run `pnpm typecheck` and `pnpm typecheck:tests`.
- [ ] 5.4 Run `openspec validate refresh-lsp-diagnostics-before-agent-start --strict`.
