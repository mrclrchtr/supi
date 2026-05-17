# CLAUDE.md

This file contains non-obvious guidance for future work in `packages/supi-lsp/`.

## Scope

`@mrclrchtr/supi-lsp` has two explicit surfaces:
- `@mrclrchtr/supi-lsp/extension` → `src/extension.ts` → registers the `lsp` tool, LSP-aware read/write/edit overrides, `/lsp-status`, settings, and the custom diagnostic message renderer
- `@mrclrchtr/supi-lsp/api` → `src/api.ts` → reusable library surface (`getSessionLspService`, `SessionLspService`, exported types, and session-scoped implementation lookup)

## Tool actions overview

The `lsp` tool uses 1-based position coordinates. `tool-actions.ts` validates inputs and formats results. Language-level actions are `hover`, `definition`, `references`, `symbols`, `rename`, and `code_actions`. Workspace search actions are `workspace_symbol`, `search`, and `symbol_hover`. The `recover` action forces a workspace-wide diagnostic refresh and can restart clients that still look stale. Diagnostics can be requested per file or project-wide, and the same diagnostic data is also surfaced inline after `write` and `edit`.

### Guidance layering

Two layers steer the agent toward LSP over raw text search. Stable `promptGuidelines` go into pi's system prompt at session start and describe which action to prefer for each job, including the active servers and file types. Dynamic diagnostic context is injected only when outstanding diagnostics exist. The renderer keeps a summary in `content`, stores raw XML in `details.promptContent`, and the `context` hook restores `promptContent` before the model sees it.

### Severity levels

Diagnostics are controlled by `/supi-settings`. The default threshold is `1`, so only errors are shown. The levels are Error (`1`), Warning (`2`), Information (`3`), and Hint (`4`).

## Key files

`lsp.ts` owns extension wiring, lifecycle, commands, and resource registration. `tool-actions.ts` handles tool action execution and formatting. `manager.ts` and the `manager-*.ts` helpers own client lifecycle, root resolution, diagnostic state, and workspace recovery. `manager-helpers.ts` holds smaller private helpers such as `clientKey`, `resolveRootForFile`, and `isExcludedByPattern`. `client.ts` wraps initialization, document sync, and requests.

`service-registry.ts` exposes the shared session-scoped API for peer extensions. `guidance.ts` formats prompt guidelines and diagnostic-context text. `diagnostics/stale-diagnostics.ts` detects suspicious missing-module clusters for stale-warning output, while `diagnostics/suppression-diagnostics.ts` handles stale suppression diagnostics for inline and pre-turn output. `manager/manager-diagnostics.ts` keeps file-sync and cascade-diagnostic helpers out of `manager.ts`, and `manager/manager-workspace-recovery.ts` owns soft recovery and targeted client restarts. `overrides.ts`, `renderer.ts`, and `ui.ts` handle tool-result augmentation, custom messages, and the status overlay. `pattern-matcher.ts` implements gitignore-style exclusion matching. `settings-registration.ts` registers enable, severity, active-server, and exclude-pattern settings.

## Validation

Run `pnpm exec biome check packages/supi-lsp && pnpm vitest run packages/supi-lsp/ && pnpm exec tsc --noEmit -p packages/supi-lsp/tsconfig.json && pnpm exec tsc --noEmit -p packages/supi-lsp/__tests__/tsconfig.json`.

## Architecture gotchas

Stable LSP guidance belongs in tool `promptGuidelines`. `before_agent_start` should inject only dynamic XML-framed diagnostic messages and should not mutate `systemPrompt`. `lsp-context` messages keep the renderer summary in `content` and stash raw XML in `details.promptContent`; the `context` hook restores `promptContent` before the model sees it. `buildProjectGuidelines()` is applied by re-registering the `lsp` tool at `session_start`, so `/reload` is required before newly scanned server guidance appears.

`/lsp-status` must merge proactive scan roots with lazily started clients because the session-start scan snapshot is incomplete. Tool activation state is persisted with `pi.appendEntry()` as `lsp-active` entries and restored by inspecting the active branch during `session_tree`. The library surface behind `src/api.ts` / `src/index.ts` must not import extension-only modules such as `lsp.ts`, `renderer.ts`, or `ui.ts`. Keep the `/api` surface limited to `service-registry.ts`, `client.ts`, `manager.ts`, and `types.ts`. `SessionLspService` is the stable wrapper and should not leak `LspManager` internals. The session registry is process-global through `Symbol.for("@mrclrchtr/supi-lsp/session-registry")`, keyed by normalized `cwd`, updated synchronously in `session_start` and `session_shutdown`, and read synchronously by `getSessionLspService(cwd)`.

## Diagnostic behavior gotchas

`before_agent_start` uses a two-pass prune, refresh, prune flow. Late `publishDiagnostics` notifications can recreate stale entries after the first prune, so `getAllDiagnostics()` also filters with `existsSync` as a read-side guard. Workspace sentinel scanning covers `package.json`, root lockfiles, `tsconfig*`, and generated `*.d.ts` files. Immediate soft recovery after tool results is triggered for successful `write` and `edit` calls that affect (a) workspace sentinel paths or (b) source files whose extension matches any configured language server's `fileTypes` (e.g., `.ts`, `.py`, `.rs`). This keeps the LSP server aware of new source files so cross-file diagnostics are recomputed. `recover` restarts clients only when the stale cluster survives that soft recovery.

Pull diagnostic sync should use pull when `diagnosticProvider` is available and fall back to push waits otherwise. Clear the `resultId` cache after file creation so cross-file diagnostics are recomputed. Cleanup paths such as `didClose`, prune, refresh deletion, and shutdown must release pending waiters instead of only deleting waiter maps. Stale suppression diagnostics, including "Suppression comment has no effect" and unused `@ts-expect-error`, still show up when inline diagnostics are error-only. Inline diagnostics after `write` and `edit` can include cascade updates from `relatedDocuments`, and severity-1 results are augmented with hover and code actions at the first error position.

## Tool action gotchas

Standalone `lsp` actions validate parameters explicitly and return `Validation error: ...` strings instead of throwing. Relative `file` inputs resolve from `manager.getCwd()`, not `process.cwd()`. `line` and `character` must be positive 1-based integers before conversion to zero-based coordinates. Missing-file diagnostics return a clear file-access message instead of relying on a thrown exception.

## Package-specific conventions

Keep summary and relevance formatting out of `manager.ts`; use focused helpers such as `summary.ts` or `manager-*.ts` modules. `ctx.cwd` is threaded through `LspManager` and formatting utilities, so do not use `process.cwd()` for path resolution.

`loadConfig()` reads server definitions from supi config (`~/.pi/agent/supi/config.json` and `.pi/supi/config.json`) under `lsp.servers`. `.pi-lsp.json` is no longer read. Keys are language names such as `typescript`, `python`, `rust`, `c`, `cpp`, `ruby`, `java`, and `kotlin`, not server binary names. Each language entry merges independently against built-in defaults, and omitted fields fall back to the code default for that language. The active-server allowlist is stored under `lsp.active` and applied in `session_start` after config load.

User exclusion patterns live under `lsp.exclude` as gitignore-style glob strings. They are loaded in `session_start`, stored on `LspManager` through `setExcludePatterns()`, and applied only by diagnostic and coverage collection methods; explicit `lsp` tool actions are not filtered. `isGlobMatch()` in `pattern-matcher.ts` supports leading `/` for anchored matches, trailing `/` for directory-only matches, `**` for recursive wildcards, and `*` for single-segment wildcards.

## Integration test coverage

### Required vs optional

- **Required (CI)**: TypeScript integration tests (`client.integration.test.ts`, `manager.integration.test.ts`, `tool-actions.integration.test.ts`, `tool-actions-workspace.integration.test.ts`) — these use `typescript-language-server` + `tsserver`, which must be available.
- **Optional (local)**: Python (`client.integration.python.test.ts`) and Bash (`client.integration.bash.test.ts`) tests that skip gracefully when the corresponding server binary is not on `PATH`.

All integration tests use `describe.skipIf(!HAS_COMMAND)` so they are transparently skipped when the server is unavailable. The missing-server test in `client.integration.bash.test.ts` always runs because it tests behavior when a nonexistent binary is configured.

### Test coverage by language

| Language | Server | Tests |
|----------|--------|-------|
| TypeScript | `typescript-language-server` | Client start/shutdown, hover, definition, document symbols, diagnostics (valid + broken), fix-and-verify, code actions, workspace symbols |
| Python | `pyright-langserver` | Client start/shutdown, hover (function + parameter), definition, document symbols, diagnostics (valid + broken), fix-and-verify, workspace symbols, shutdown-after-error |
| Bash | `bash-language-server` | Client start/shutdown, diagnostics, document symbols, missing-binary robustness |

## Focused test commands

Use `pnpm exec vitest run packages/supi-lsp/__tests__/client-pull-diagnostics.test.ts packages/supi-lsp/__tests__/renderer.test.ts` for a small pull-diagnostic and custom-message regression pass. Use `pnpm exec vitest run packages/supi-lsp/__tests__/service-registry.test.ts` for the public API and registry lifecycle.

Use `pnpm exec vitest run packages/supi-lsp/__tests__/tool-actions.validation.test.ts packages/supi-lsp/__tests__/tool-actions.recover.test.ts` for parameter validation, the recovery action contract, and path resolution. Use `pnpm exec vitest run packages/supi-lsp/__tests__/diagnostic-cascade.test.ts packages/supi-lsp/__tests__/overrides-cascade.test.ts packages/supi-lsp/__tests__/suppression-diagnostics.test.ts packages/supi-lsp/__tests__/stale-diagnostics.test.ts` for cascade detection, inline output, stale-module clustering, and suppression coverage.

```bash
pnpm exec vitest run packages/supi-lsp/__tests__/client-refresh.test.ts packages/supi-lsp/__tests__/client-pull-diagnostics.test.ts packages/supi-lsp/__tests__/transport.test.ts
pnpm exec vitest run packages/supi-lsp/__tests__/system-prompt.test.ts packages/supi-lsp/__tests__/renderer.test.ts
```

### Running cross-language integration tests

```bash
# Full suite (will skip servers not on PATH)
pnpm exec vitest run packages/supi-lsp/__tests__/*.integration.*.test.ts
# Python only
pnpm exec vitest run packages/supi-lsp/__tests__/client.integration.python.test.ts
# Bash only
pnpm exec vitest run packages/supi-lsp/__tests__/client.integration.bash.test.ts
```
