# @mrclrchtr/supi-lsp

## Scope

This is a library-only package with two explicit exports:

- `@mrclrchtr/supi-lsp/api` → controller, `WorkspaceLspRuntime` types, registry operations, configuration, coordinates, and diagnostics types
- `@mrclrchtr/supi-lsp/provider/lsp-semantic-provider` → the shared semantic-provider adapter

There is no PI extension entrypoint and no model-callable `lsp_*` tool surface. `supi-code-intelligence` owns the public `code_*` family.

## Runtime architecture

`LspRuntimeController` owns lifecycle and status. `WorkspaceLspRuntime` owns routing, semantic readiness and operations, tracked files, diagnostics, and recovery. A ready controller publishes `{ kind: "ready", runtime }`; when every configured server definition is disabled, the controller publishes `{ kind: "disabled", reason }` without creating a runtime owner. Runtime ownership is not semantic readiness: workspace readiness requires at least one concrete active-ready client, and file readiness requires a non-null routed client.

`WorkspaceLspRuntime` is an exported interface. `DefaultWorkspaceLspRuntime`, clients, and `LspManager` remain internal. Never add manager/client access to the public runtime.

The private `DefaultWorkspaceLspRuntime` is the single operational seam. It normalizes
paths, coordinates readiness, semantic requests, tracked files, diagnostics, recovery,
and owner-controlled shutdown around the package-internal `LspManager`. Clients and the
manager never cross the public runtime interface.

The registry uses the shared core session-state helper and retains explicit ready, pending, inactive, disabled, and unavailable states. Pending polling uses `waitForWorkspaceLspRuntime(cwd)`. Empty workspace warm-up leaves the ready owner published and semantic registration pending so a lazy file route can still start; never promote via `Promise.all([])` or retract the owner solely because no client was proactive.

Runtime positions are raw 0-based LSP coordinates. Use `toLspPosition()` when starting from 1-based tool coordinates. Semantic operations accept optional shared `CodeRequestControl` metadata. Preserve the exact value through adapters and runtime interfaces, but do not apply its signal or deadline to clients or transport in the expansion stage.

## Key files

- `src/client/` — protocol client, transport, document/diagnostic state, refresh, and request handling
- `src/config/` — server definitions, settings, capabilities, actions, protocol types, and tsconfig scope
- `src/diagnostics/` — diagnostic summaries, stale diagnostics, and workspace sentinels
- `src/manager/manager.ts` + `manager-*.ts` — package-internal server pool, routing, diagnostics, and recovery mechanics
- `src/provider/lsp-semantic-provider.ts` — semantic-provider adapter
- `src/provider/semantic-symbol-mapper.ts` — LSP-to-shared symbol, location, and hover mapping
- `src/provider/lsp-refactor-provider.ts` — refactor-capability adapter composition
- `src/provider/refactor-planning.ts` — refactor request flow and code-action matching
- `src/provider/semantic-edit-normalizer.ts` — fail-closed edit normalization and document preconditions
- `src/session/runtime-controller.ts` — lifecycle/status
- `src/session/workspace-lsp-runtime.ts` — public workspace runtime contracts
- `src/session/runtime-registry.ts` — Workspace runtime implementation and registry
- `src/session/runtime-registration.ts` — capability-broker registration
- `src/session/scanner.ts` — workspace detection and startup

## Semantic and refactor behavior

The provider maps semantic requests to `WorkspaceLspRuntime`. Read-only semantic and diagnostic requests return `CodeQueryResult<T>`: protocol-level empty data is `completed`, multi-client incomplete collection is `partial`, and routing/request/synchronization failure is `unavailable`. Do not collapse these states back to `null` or `[]`.

Public code-intelligence refactors currently use:

- `rename_symbol` → `textDocument/rename`
- `extract_function` → matching precise code action
- `extract_variable` → matching precise code action

Only precise text edits cross into refactor plans. Resource/file operations remain unavailable.

Diagnostic severity: Error (`1`), Warning (`2`), Information (`3`), Hint (`4`). The default threshold is `1`.

## Transport gotchas

`client/transport.ts` wraps `vscode-jsonrpc`'s `createMessageConnection`. `JsonRpcRequestError` aliases `ResponseError` so server-request handlers retain JSON-RPC error codes. Timeouts use `CancellationTokenSource` plus `Promise.race`, and pass the token to `sendRequest`.

During shutdown, `vscode-jsonrpc` may emit `Cannot call write after a stream was destroyed` when a server writes after stream closure. This is harmless cleanup noise.

## Diagnostic behavior

- `ClientDiagnostics` owns open documents, diagnostic cache entries, pending diagnostic waiters, pull refresh, and push-settle behavior. `LspClient` delegates through behavioral methods and does not expose these maps.
- Session startup uses prune → refresh → prune because late `publishDiagnostics` can recreate stale entries.
- Diagnostic reads also filter missing files with `existsSync`.
- Workspace sentinels include `package.json`, root lockfiles, `tsconfig*`, and generated `*.d.ts` files.
- Successful `write`/`edit` calls trigger soft recovery for sentinels and configured source extensions.
- Recovery restarts clients only if stale clusters survive soft recovery.
- Pull diagnostics are preferred when `diagnosticProvider` exists; otherwise wait for push diagnostics.
- Clear pull `resultId` state after file creation so cross-file diagnostics recompute.
- `didClose`, prune, refresh deletion, and shutdown must release pending waiters.

## Configuration

`loadConfig()` reads `lsp.servers` from SuPi project/global config. `.pi-lsp.json` is not read. Built-in keys are language names (`typescript`, `python`, `rust`, `go`, `c`, `ruby`, `java`, `kotlin`, `bash`, `html`, `sql`, `r`), not binary names; `cpp` aliases to `c`.

Always-on policy:

- `lsp.enabled` is deprecated and ignored.
- `lsp.active` is deprecated and ignored.
- `lsp.servers.<language>.enabled: false` is the only opt-out.
- If every server definition is disabled, startup is a successful disabled state, not a ready runtime with zero servers.
- `getDeprecatedLspKeys()` lets downstream packages report old keys.

`lsp.exclude` contains gitignore-style patterns used only by diagnostics and coverage. Explicit semantic requests are not filtered. `isGlobMatch()` supports anchored `/`, directory-only trailing `/`, `**`, and single-segment `*`.

`didOpen` language IDs must follow the server's document contract rather than blindly reuse the extension: ERB uses `erb`, Go module manifests use `go.mod`, and shell dialect extensions use `shellscript`.

Thread `ctx.cwd` through manager and formatting code; do not use `process.cwd()` for workspace path resolution.

## Tests

Required TypeScript integration tests use `typescript-language-server` and `tsserver`. Python and Bash integration tests skip when their binaries are unavailable. All optional suites use `describe.skipIf(!HAS_COMMAND)`.

Focused commands:

```bash
pnpm exec vitest run packages/supi-lsp/__tests__/unit/runtime-registry.test.ts
pnpm exec vitest run packages/supi-lsp/__tests__/unit/runtime-controller.test.ts
pnpm exec vitest run packages/supi-lsp/__tests__/unit/client-refresh.test.ts packages/supi-lsp/__tests__/unit/client-pull-diagnostics.test.ts packages/supi-lsp/__tests__/unit/transport.test.ts
pnpm exec vitest run packages/supi-lsp/__tests__/unit/diagnostic-summary.test.ts packages/supi-lsp/__tests__/unit/stale-diagnostics.test.ts packages/supi-lsp/__tests__/unit/workspace-sentinels.test.ts
pnpm exec vitest run packages/supi-lsp/__tests__/integration/*.integration.*.test.ts
```

After structural changes, run package TypeScript tests and `pnpm verify:ai`.
