## 1. supi-claude-md Message Renderer

- [x] 1.1 Add `registerMessageRenderer("supi-claude-md-refresh", ...)` to `supi-claude-md/index.ts` extension factory — collapsed view shows `📄 CLAUDE.md refreshed (N files)`, expanded view adds token and file details
- [x] 1.2 Change `display: false` to `display: true` on the `supi-claude-md-refresh` message in `before_agent_start` handler
- [x] 1.3 Add unit tests for the `supi-claude-md-refresh` renderer (collapsed, expanded, missing details)

## 2. supi-lsp Message Renderer

- [x] 2.1 Add `registerMessageRenderer("lsp-context", ...)` to `supi-lsp/lsp.ts` extension factory — collapsed view shows diagnostic summary with severity-colored counts, expanded view adds per-file breakdown and token
- [x] 2.2 Change `display: false` to `display: true` on the `lsp-context` message in `before_agent_start` handler
- [x] 2.3 Remove the `ctx.ui.notify()` call in `before_agent_start` (the `buildDiagnosticsNotification` call after setting `currentContextToken`) — the rendered message replaces it
- [x] 2.4 Remove the `buildDiagnosticsNotification` function and its helpers (`formatNotificationCounts`, `collectDiagnosticTotals`) since they're no longer used
- [x] 2.5 Add unit tests for the `lsp-context` renderer (collapsed with errors/warnings, collapsed clean, expanded, missing details)

## 3. Integration Verification

- [x] 3.1 Run `pnpm typecheck` and fix any type errors
- [x] 3.2 Run `pnpm test` and ensure all existing tests pass
- [x] 3.3 Run `pnpm biome:fix && pnpm biome:ai` and fix lint issues
- [x] 3.4 Verify `pnpm verify` passes (our packages pass; pre-existing failures in brainstorm skill only)