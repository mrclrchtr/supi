# CLAUDE.md

## Scope

`@mrclrchtr/supi-lsp` is a **library-only** package with one explicit surface:
- `@mrclrchtr/supi-lsp/api` → `src/api.ts` → reusable library surface (`getSessionLspService`, `waitForSessionLspService`, `SessionLspService`, LSP types, provider interfaces, and exported semantic/diagnostic result types)

This package has **no pi extension surface** — no `pi.extensions`, no `src/extension.ts`, no `./extension` export. Public substrate-named tools were removed from the surface; `@mrclrchtr/supi-code-intelligence` now exposes only intent-level `code_*` tools backed by this library.

## Semantic substrate role

This package does not register pi tools. It provides the `SessionLspService` and `SemanticProvider` implementation consumed by `@mrclrchtr/supi-code-intelligence`.

For first-wave refactors, `src/provider/lsp-semantic-provider.ts` maps:
- `rename_symbol` (and legacy `rename`) → `textDocument/rename`
- `update_imports` → precise organize-imports/source actions only
- `delete_dead_code` → precise quickfix/refactor-rewrite actions only
- `rename_file` / `move_file` → explicit unavailable results for now

Diagnostic severity: Error (`1`), Warning (`2`), Information (`3`), Hint (`4`). The default threshold is `1` (errors only).

## Key files

- **LSP client**: `src/client/client.ts` (init, sync, requests), `src/client/transport.ts` (JSON-RPC via vscode-jsonrpc), `src/client/client-refresh.ts`
- **Manager**: `src/manager/manager.ts` + `manager-*.ts` (lifecycle, root, diagnostics, recovery, workspace-symbol, stale-resync, client-state)
- **Config**: `src/config/types.ts` (re-exports vscode-lsp types), `src/config/server-config.ts` (SuPi types), `src/config/config.ts` (loadConfig), `src/config/lsp-settings.ts`
- **Session API**: `src/session/service-registry.ts` (peer extension access, backed by supi-core), `src/session/runtime-controller.ts`, `src/session/runtime-registration.ts`, `src/session/scanner.ts`
- **Diagnostics**: `src/diagnostics/stale-diagnostics.ts`, `src/diagnostics/suppression-diagnostics.ts`, `src/diagnostics/workspace-sentinels.ts`, `src/diagnostics/diagnostic-context.ts`, `src/manager/manager-diagnostics.ts`
- **Provider**: `src/provider/lsp-semantic-provider.ts` (SemanticProvider impl consumed by supi-code-intelligence)
- **Other**: `src/pattern-matcher.ts` (gitignore-style exclusion), `src/summary.ts`, `src/utils.ts`, `src/coordinates.ts`

## Architecture gotchas

`SessionLspService` is the stable wrapper for peer extensions and must not leak `LspManager` internals. Its position arguments are raw 0-based LSP coordinates; use `toLspPosition()` from `@mrclrchtr/supi-lsp/api` when starting from 1-based user coordinates. The session registry reuses the shared `supi-core` session-state helper for normalized-cwd storage, but LSP keeps its own `pending` polling through `waitForSessionLspService(cwd)`.

The library surface behind `src/api.ts` / `src/index.ts` must not import extension-only modules. The `/api` surface is limited to `session/service-registry.ts`, `client/`, `manager/`, `config/`, and `diagnostics/` utilities. Tool registration, guidance, overrides, settings registration, and pi event handlers are the responsibility of `@mrclrchtr/supi-code-intelligence`.

`client/transport.ts` wraps `vscode-jsonrpc`'s `createMessageConnection`. `JsonRpcRequestError` is an alias for `ResponseError` — it preserves JSON-RPC error codes when thrown from server-initiated request handlers. Timeouts use `CancellationTokenSource` plus `Promise.race` so callers never hang, and the token is passed to `sendRequest` so the connection can short-circuit on cancellation. The `vscode-jsonrpc` writer may emit a `Cannot call write after a stream was destroyed` unhandled rejection during shutdown when the server process writes after the stream is closed — this is harmless cleanup noise, not a bug.

## Diagnostic behavior gotchas

`before_agent_start` uses a two-pass prune, refresh, prune flow. Late `publishDiagnostics` notifications can recreate stale entries after the first prune, so `getAllDiagnostics()` also filters with `existsSync` as a read-side guard. Workspace sentinel scanning covers `package.json`, root lockfiles, `tsconfig*`, and generated `*.d.ts` files. Immediate soft recovery after tool results is triggered for successful `write` and `edit` calls that affect (a) workspace sentinel paths or (b) source files whose extension matches any configured language server's `fileTypes` (e.g., `.ts`, `.py`, `.rs`). This keeps the LSP server aware of new source files so cross-file diagnostics are recomputed. `recover` restarts clients only when the stale cluster survives that soft recovery.

Pull diagnostic sync should use pull when `diagnosticProvider` is available and fall back to push waits otherwise. Clear the `resultId` cache after file creation so cross-file diagnostics are recomputed. Cleanup paths such as `didClose`, prune, refresh deletion, and shutdown must release pending waiters instead of only deleting waiter maps. Stale suppression diagnostics, including "Suppression comment has no effect" and unused `@ts-expect-error`, still show up when inline diagnostics are error-only. Inline diagnostics after `write` and `edit` can include cascade updates from `relatedDocuments`, and severity-1 results are augmented with hover and code actions at the first error position.


## Package-specific conventions

Keep summary and relevance formatting out of `manager.ts`; use focused helpers such as `summary.ts` or `manager-*.ts` modules. `ctx.cwd` is threaded through `LspManager` and formatting utilities, so do not use `process.cwd()` for path resolution.

`loadConfig()` reads server definitions from supi config (`~/.pi/agent/supi/config.json` and `.pi/supi/config.json`) under `lsp.servers`. `.pi-lsp.json` is no longer read. Keys are language names such as `typescript`, `python`, `rust`, `c`, `cpp`, `ruby`, `java`, and `kotlin`, not server binary names. Each language entry merges independently against built-in defaults, and omitted fields fall back to the code default for that language.

### Always-on LSP policy

- The global `lsp.enabled` switch is **deprecated and ignored** — LSP always attempts to start detected servers.
- The `lsp.active` allowlist is **deprecated and ignored** — all detected servers are started.
- Per-language disable through `lsp.servers.<language>.enabled: false` is the only supported opt-out.
- Deprecated keys (`lsp.enabled`, `lsp.active`) are detected at session start via `getDeprecatedLspKeys()` from `@mrclrchtr/supi-lsp/api`. Downstream packages (e.g., `supi-code-intelligence`) use this to emit one-time deprecation warnings.

User exclusion patterns live under `lsp.exclude` as gitignore-style glob strings. They are loaded in `session_start`, stored on `LspManager` through `setExcludePatterns()`, and applied only by diagnostic and coverage collection methods; explicit semantic requests issued through the public `code_*` tools are not filtered. `isGlobMatch()` in `pattern-matcher.ts` supports leading `/` for anchored matches, trailing `/` for directory-only matches, `**` for recursive wildcards, and `*` for single-segment wildcards.

## Integration test coverage

### Required vs optional

- **Required (CI)**: TypeScript integration tests (`client.integration.test.ts`, `manager.integration.test.ts`, `service-actions.integration.test.ts`, `service-actions-workspace.integration.test.ts`) — these use `typescript-language-server` + `tsserver`, which must be available.
- **Optional (local)**: Python (`client.integration.python.test.ts`) and Bash (`client.integration.bash.test.ts`) tests that skip gracefully when the corresponding server binary is not on `PATH`.

All integration tests use `describe.skipIf(!HAS_COMMAND)` so they are transparently skipped when the server is unavailable. The missing-server test in `client.integration.bash.test.ts` always runs because it tests behavior when a nonexistent binary is configured.

### Test coverage by language

| Language | Server | Tests |
|----------|--------|-------|
| TypeScript | `typescript-language-server` | Client start/shutdown, hover, definition, document symbols, diagnostics (valid + broken), fix-and-verify, code actions, workspace symbols |
| Python | `pyright-langserver` | Client start/shutdown, hover (function + parameter), definition, document symbols, diagnostics (valid + broken), fix-and-verify, workspace symbols, shutdown-after-error |
| Bash | `bash-language-server` | Client start/shutdown, diagnostics, document symbols, missing-binary robustness |

## Focused test commands

```bash
# Public API and registry lifecycle
pnpm exec vitest run packages/supi-lsp/__tests__/unit/service-registry.test.ts
# Client lifecycle and transport
pnpm exec vitest run packages/supi-lsp/__tests__/unit/client-refresh.test.ts packages/supi-lsp/__tests__/unit/client-pull-diagnostics.test.ts packages/supi-lsp/__tests__/unit/transport.test.ts
# Diagnostics, suppression, stale detection
pnpm exec vitest run packages/supi-lsp/__tests__/unit/diagnostic-cascade.test.ts packages/supi-lsp/__tests__/unit/suppression-diagnostics.test.ts packages/supi-lsp/__tests__/unit/stale-diagnostics.test.ts
# Config and manager
pnpm exec vitest run packages/supi-lsp/__tests__/unit/config.test.ts packages/supi-lsp/__tests__/unit/manager-workspace-recovery.test.ts
```

### Running cross-language integration tests

```bash
# Full suite (will skip servers not on PATH)
pnpm exec vitest run packages/supi-lsp/__tests__/integration/*.integration.*.test.ts
# Python only
pnpm exec vitest run packages/supi-lsp/__tests__/integration/client.integration.python.test.ts
# Bash only
pnpm exec vitest run packages/supi-lsp/__tests__/integration/client.integration.bash.test.ts
```
