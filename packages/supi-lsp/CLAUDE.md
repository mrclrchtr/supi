# CLAUDE.md

This file contains non-obvious guidance for future work in `packages/supi-lsp/`.

## Scope

`@mrclrchtr/supi-lsp` registers the `lsp` tool, LSP-aware read/write/edit overrides, `/lsp-status`, settings, and the custom diagnostic message renderer. It also exposes a public reusable library surface from the package root.

Entrypoints:
- `lsp.ts` — extension wiring, lifecycle, commands, and resources
- `index.ts` — public library surface (`getSessionLspService`, `SessionLspService`, types)

## Key files

- `lsp.ts` — extension wiring, lifecycle, commands, and resources
- `tool-actions.ts` — tool action execution and formatting
- `manager.ts` + `manager-*.ts` — client lifecycle, roots, and diagnostic state
- `client.ts` — LSP client wrapper (initialize, document sync, requests)
- `service-registry.ts` — shared session-scoped registry for peer extension reuse
- `guidance.ts` — prompt guidelines/snippet and diagnostic-context formatting
- `overrides.ts`, `renderer.ts`, `ui.ts` — tool-result augmentation, custom messages, and status overlay

## Validation

- `pnpm exec biome check packages/supi-lsp && pnpm vitest run packages/supi-lsp/ && pnpm exec tsc --noEmit -p packages/supi-lsp/tsconfig.json && pnpm exec tsc --noEmit -p packages/supi-lsp/__tests__/tsconfig.json`

## Architecture gotchas

- Stable LSP guidance belongs in tool `promptGuidelines`; `before_agent_start` should inject only dynamic XML-framed diagnostic messages, not mutate `systemPrompt`.
- `lsp-context` messages keep the renderer-friendly summary in `content` and stash raw XML in `details.promptContent`; the `context` hook restores `promptContent` before the model sees it.
- `buildProjectGuidelines()` is applied by re-registering the `lsp` tool at `session_start`, so `/reload` is needed to refresh scanned server guidance.
- `/lsp-status` must merge proactive scan roots with lazily started clients; the session-start scan snapshot is incomplete.
- Tool activation state is persisted via `pi.appendEntry()` as `lsp-active` entries and restored by inspecting the active branch on `session_tree`.
- The public library surface (`index.ts`) must not import from extension-only modules (e.g., `lsp.ts`, `renderer.ts`, `ui.ts`). Keep the root API limited to `service-registry.ts`, `client.ts`, `manager.ts`, and `types.ts`.
- `SessionLspService` is an intentional wrapper: it exposes stable semantic operations without leaking `LspManager` internals as the public contract.
- The session registry is process-global via `Symbol.for("@mrclrchtr/supi-lsp/session-registry")` and keyed by normalized `cwd`, so independently loaded package module roots can share the same published LSP service. It is updated synchronously in `session_start` / `session_shutdown` handlers and read synchronously by `getSessionLspService(cwd)`.

## Diagnostic behavior gotchas

- Diagnostic cleanup (`didClose`, prune, refresh deletion, shutdown) must release pending waiters, not just delete waiter maps.
- Push diagnostic refresh should settle after `quietMs` even when no publications arrive; avoid forcing every turn to wait `maxWaitMs`.
- Pull diagnostics should use `JsonRpcClient.sendRequest(..., { timeoutMs })` so timed-out requests leave the pending map promptly.
- Pull diagnostic reports can include `relatedDocuments` on `unchanged` top-level reports; apply related full reports regardless of top-level kind.
- Track pull diagnostic `resultId` in the diagnostic cache and send it back as `previousResultId`.
- Single-file diagnostic sync (`syncAndWaitForDiagnostics`) should prefer pull diagnostics when `diagnosticProvider` is advertised, then fall back to push waits.
- `syncAndWaitForDiagnostics()` backs both `write`/`edit` inline diagnostics and the `lsp diagnostics` action; keep its pull/push behavior aligned with `refreshOpenDiagnostics()`.
- After `write`/`edit`, severity-1 diagnostics are augmented with LSP `hover` (3-line truncation) and `code_actions` titles at the first error position, each with a 500ms timeout.

## Tool action gotchas

- Standalone `lsp` tool actions validate parameters explicitly and return `Validation error: ...` strings instead of throwing.
- Relative `file` inputs resolve from `manager.getCwd()`, not `process.cwd()`.
- `line` and `character` are validated as positive 1-based integers before conversion to zero-based coordinates.
- Missing-file errors in `diagnostics` return a clear file-access message rather than relying on thrown exceptions.

## Package-specific conventions

- Keep summary/relevance formatting out of `manager.ts`; prefer focused helpers like `summary.ts` or `manager-*.ts` modules.
- `manager.ts` + Biome `noExcessiveLinesPerFile` — extract focused `manager-*.ts` helpers before commit hooks fail on the 400-line cap.
- `ctx.cwd` is threaded through `LspManager` and formatting utilities; do not use `process.cwd()` for path resolution.
- `loadConfig()` reads server definitions from supi config (`~/.pi/agent/supi/config.json` and `.pi/supi/config.json`) under the `lsp.servers` key. `.pi-lsp.json` is no longer read. Keys are **language names** (e.g., `typescript`, `python`, `rust`, `c`, `cpp`, `ruby`, `java`, `kotlin`), not server binary names. Each language entry merges individually against built-in defaults; omitted fields fall back to the code default for that language.
- The settings allowlist is stored under `lsp.active` (array of language names) and applied in `session_start` after loading config.

## Focused test commands

- `pnpm exec vitest run packages/supi-lsp/__tests__/client-pull-diagnostics.test.ts packages/supi-lsp/__tests__/renderer.test.ts` — minimal regression pass for pull-diagnostic + custom-message context changes.
- `pnpm exec vitest run packages/supi-lsp/__tests__/service-registry.test.ts` — public API + registry lifecycle.
- `pnpm exec vitest run packages/supi-lsp/__tests__/tool-actions.validation.test.ts` — parameter validation + path resolution.

```bash
pnpm exec vitest run packages/supi-lsp/__tests__/client-refresh.test.ts packages/supi-lsp/__tests__/client-pull-diagnostics.test.ts packages/supi-lsp/__tests__/transport.test.ts
pnpm exec vitest run packages/supi-lsp/__tests__/system-prompt.test.ts packages/supi-lsp/__tests__/renderer.test.ts
```
