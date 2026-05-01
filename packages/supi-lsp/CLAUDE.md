# CLAUDE.md

This file contains non-obvious guidance for future work in `packages/supi-lsp/`.

## Architecture gotchas

- Stable LSP guidance belongs in tool `promptGuidelines`; `before_agent_start` should inject only dynamic XML-framed diagnostic messages, not mutate `systemPrompt`.
- `lsp-context` messages keep the renderer-friendly summary in `content` and stash raw XML in `details.promptContent`; the `context` hook restores `promptContent` before the model sees it.
- `buildProjectGuidelines()` is applied by re-registering the `lsp` tool at `session_start`, so `/reload` is needed to refresh scanned server guidance.
- `/lsp-status` must merge proactive scan roots with lazily started clients; the session-start scan snapshot is incomplete.
- Tool activation state is persisted via `pi.appendEntry()` as `lsp-active` entries and restored by inspecting the active branch on `session_tree`.

## Diagnostic behavior gotchas

- Diagnostic cleanup (`didClose`, prune, refresh deletion, shutdown) must release pending waiters, not just delete waiter maps.
- Push diagnostic refresh should settle after `quietMs` even when no publications arrive; avoid forcing every turn to wait `maxWaitMs`.
- Pull diagnostics should use `JsonRpcClient.sendRequest(..., { timeoutMs })` so timed-out requests leave the pending map promptly.
- Pull diagnostic reports can include `relatedDocuments` on `unchanged` top-level reports; apply related full reports regardless of top-level kind.
- Track pull diagnostic `resultId` in the diagnostic cache and send it back as `previousResultId`.
- Single-file diagnostic sync (`syncAndWaitForDiagnostics`) should prefer pull diagnostics when `diagnosticProvider` is advertised, then fall back to push waits.
- `syncAndWaitForDiagnostics()` backs both `write`/`edit` inline diagnostics and the `lsp diagnostics` action; keep its pull/push behavior aligned with `refreshOpenDiagnostics()`.
- After `write`/`edit`, severity-1 diagnostics are augmented with LSP `hover` (3-line truncation) and `code_actions` titles at the first error position, each with a 500ms timeout.

## Package-specific conventions

- Keep summary/relevance formatting out of `manager.ts`; prefer focused helpers like `summary.ts` or `manager-*.ts` modules.
- `ctx.cwd` is threaded through `LspManager` and formatting utilities; do not use `process.cwd()` for path resolution.
- `loadConfig()` handles only `.pi-lsp.json` server definitions; settings allowlists are applied in `session_start` after loading config.

## Focused test commands

- `pnpm exec vitest run packages/supi-lsp/__tests__/client-pull-diagnostics.test.ts packages/supi-lsp/__tests__/renderer.test.ts` — minimal regression pass for pull-diagnostic + custom-message context changes.

```bash
pnpm exec vitest run packages/supi-lsp/__tests__/client-refresh.test.ts packages/supi-lsp/__tests__/client-pull-diagnostics.test.ts packages/supi-lsp/__tests__/transport.test.ts
pnpm exec vitest run packages/supi-lsp/__tests__/system-prompt.test.ts packages/supi-lsp/__tests__/renderer.test.ts
```
