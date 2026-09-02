<div align="center">
  <a href="https://github.com/mrclrchtr/supi/tree/main/packages/supi-lsp">
    <img src="https://raw.githubusercontent.com/mrclrchtr/supi/main/packages/supi-lsp/assets/social-preview.png" alt="SuPi LSP" width="100%">
  </a>
</div>

# @mrclrchtr/supi-lsp

[![GitHub stars](https://img.shields.io/github/stars/mrclrchtr/supi)](https://github.com/mrclrchtr/supi/stargazers)

Language Server Protocol runtime library for the [pi coding agent](https://github.com/earendil-works/pi).

This package is library-only. It registers no model-callable tools; `@mrclrchtr/supi-code-intelligence` owns the public `code_*` family.

## Install

```bash
npm install @mrclrchtr/supi-lsp
```

## Language-server support

The runtime starts an installed server when the project contains a matching file type and, where configured, a root marker. Some built-in servers use extension-based discovery without a root marker. Built-in command names must be on `PATH`; a configured absolute command path is also supported. This table describes diagnostic support, not the full semantic feature set. A push server can still provide hover, definitions, references, symbols, and refactors.

The table records an initialize-handshake audit performed on 2026-08-21 against the locally installed server versions. The handshake is authoritative and can report a different mode after an upgrade; treat rows marked `unverified` as unknown until a probe confirms them. Pull-capability facts come from the official LSP specification (pull diagnostics are a 3.17 feature; 3.18 is the current specification at microsoft.github.io/language-server-protocol/specifications/lsp/3.18/specification).

| Language | Server binary | Pull diagnostics (probe) | Built-in SuPi mode | Notes |
|---|---|---|---|---|
| TypeScript / JavaScript | `typescript-language-server` 5.3.0 | No (confirmed) | Push | No `diagnosticProvider` in the initialize result. |
| Python | `pyright-langserver` 1.1.411 | Dynamic-only pull (confirmed) | Pull | No static `diagnosticProvider` in the initialize result; registers `textDocument/diagnostic` dynamically after `initialized`. The #320 handshake inspected only the initialize result and missed the registration. |
| Rust | `rust-analyzer` 0.0.0 (2026-08-10) | No (confirmed) | Push | No `diagnosticProvider` in the initialize result. |
| Go | `gopls` v0.23.0 | Conditional (confirmed) | Push | Default is push; `initializationOptions.pullDiagnostics: true` makes gopls advertise `diagnosticProvider`. Keep push while golang/go#70199 stays open; initial pull support tracked in golang/go#53275. gopls v0.23.0 pull reports omit the `kind` discriminator (`""`) and `resultId`; SuPi tolerates the empty-kind full report. |
| C / C++ | `clangd` 21.0.0 | No (confirmed) | Push | No `diagnosticProvider` in the initialize result. |
| Ruby | `ruby-lsp` 0.26.10 | No (confirmed) | Push | No `diagnosticProvider`. The server also refuses to start in a project that has a `Gemfile` without a `Gemfile.lock`. |
| Java | `jdtls` | Unverified | Push | Probe limitation: the wrapper needs a workspace launch configuration; the version probe did not respond. |
| Kotlin | `kotlin-lsp` LS-262.9593.0 | Static pull (confirmed) | Pull | Statically advertises `diagnosticProvider` in the initialize result, but only when started with `--stdio`; the built-in configuration provides the argument. |
| Bash | `bash-language-server` 5.6.0 | No (confirmed) | Push | No `diagnosticProvider` in the initialize result. |
| HTML | `vscode-html-language-server` | No (confirmed) | Push | No `diagnosticProvider` in the initialize result. |
| SQL | `sql-language-server` 1.7.1 | No (confirmed) | Push | No `diagnosticProvider` in the initialize result. |
| R | `R` 4.6.1 (languageserver) | No (confirmed) | Push | No `diagnosticProvider` in the initialize result. |

SuPi advertises static and dynamic pull support. It advertises server-requested refresh support too:

- `textDocument.diagnostic.dynamicRegistration: true`
- `workspace.diagnostics.refreshSupport: true`

A server gets pull diagnostics when it declares a valid `diagnosticProvider` during initialization. A server also gets pull diagnostics after it registers `textDocument/diagnostic`. The pull support stays active until the server removes the registration. SuPi validates registration parameters. Invalid parameters do not enable pull support. SuPi ignores other registration methods.

When a server sends `workspace/diagnostic/refresh`, SuPi returns `null` immediately. It then refreshes the owning client's tracked documents in the background. The refresh covers open, cached, and failed tracked documents. SuPi does not add workspace-wide `workspace/diagnostic` pulls.

Protocol support is separate from the configured mode. A server may support pull diagnostics and still use SuPi's push mode because the built-in configuration does not enable pull mode.

The LSP 3.18 specification adds `Diagnostic.message` markup content, guarded by the client capability `textDocument.diagnostic.markupMessageSupport`; SuPi's validator already accepts plaintext and markdown messages but does not advertise the capability. Other 3.18 features (snippet text edits, inline completion, folding-range refresh, multi-range formatting) are outside the diagnostic surface and are not implemented.

Pull diagnostics use `textDocument/diagnostic`, so the client can tie a report to the current request. Push diagnostics are asynchronous and can omit a document version. After a workspace change, SuPi may report push-only diagnostics as partial or unavailable when it cannot prove that the result matches the current document. It does not treat missing fresh evidence as a clean file.

Unversioned pushes are accepted for an open document when they arrive after the document's sync moment (the client-side instant the `didChange` or `didOpen` that produced them was sent) and are re-stamped with the current synchronization; unversioned pushes for closed or untracked URIs, and pushes that arrive before a sync moment, stay fail-closed. On push-only routes, the first valid publication for a synchronization is tentative. A later valid publication for the same synchronization confirms it, and every publication restarts the quiet period. If no publication arrives, the existing bounded reopen path may ask the server to publish on `didOpen`; a tentative timeout does not reopen that document. In a mixed batch, silent documents can still use the reopen path. Non-empty tentative diagnostics are visible as partial evidence, but they do not enter the confirmed path. An empty tentative publication cannot establish a clean file and stays unavailable until a diagnostic republish arrives. Repeated unchanged queries share the tentative publication's wait age instead of starting a new full wait. A late republish promotes the cache without a new refresh.

Server readiness follows LSP work-done progress: a created progress token is pending and never blocks readiness; an observed `begin` marks active work and makes the client not ready until its `end` or the bounded per-token timeout.

A workspace diagnostic refresh returns exact coverage counts for requested, confirmed, unconfirmed, failed, and removed tracked documents. `code_health` marks tracked-file diagnostics as complete when each requested document is confirmed or known to be removed. It shows non-empty tentative diagnostics as partial entries, reports the same coverage counts in summary and detailed views, and explains when a diagnostic republish is needed. A refresh attempt does not prove fresh evidence by itself. A removed file is reported by the refresh that finds it and is not retained in later tracked-file snapshots.

An explicit diagnostic refresh also returns a bounded process-crash report. It gives exact recovered, skipped, failed, and exhausted route counts, up to 16 route entries, and an omitted-entry count. Each entry names the server and workspace-relative root. A skipped route recommends an exact-file refresh; a failed or exhausted route recommends a workspace reload. A failed entry may include only the caught error message, limited to 512 characters. Broad refreshes select only routes whose root overlaps the requested directory and use retained tracked-file paths from the crash snapshot. Exact-file readiness reports only the file's route. Recovery does not cold-start routes, consume an attempt for a skip, or add a second attempt.

An explicit recovery pass restarts a push-only client only on a protocol-stall signal (a readiness stall, or repeated JSON-RPC request failures) — never on unconfirmed evidence alone, because the reopen-resync fallback recovers unconfirmed documents without discarding warm server state. It never restarts a pull-capable client because push evidence is absent, and it never restarts a client during passive health display. Each client route restarts at most once per workspace invalidation generation. The replacement process has a fixed startup bound of 5 seconds; exceeding the bound fails closed as start-failed without retry. Recovery telemetry records the outcome, elapsed time, attempted clients, restart count, the bounded server names involved, and the stall signal that triggered a restart, without changing the evidence semantics of the result.

### Optional diagnostic configuration

Configuration overrides merge with the built-in server definitions. Use `.pi/supi/config.json` for one project or `~/.pi/agent/supi/config.json` for all projects:

```json
{
  "lsp": {
    "servers": {
      "go": {
        "initializationOptions": {
          "pullDiagnostics": true
        }
      }
    }
  }
}
```

Gopls pull diagnostics stay opt-in while golang/go#70199 is open; without the option the built-in Go configuration stays in push mode. Kotlin's `--stdio` argument is already part of the built-in configuration and needs no override.

### Automatic workspace path policy

Automatic LSP work uses one path policy that does not change for each workspace runtime. It covers project discovery, route startup, warm-up, sentinel and source-file lists, created-file tracking, runtime guidance, and diagnostic summaries not tied to one request.

The policy excludes these directories by default: `.git`, `.cache`, `.pi`, `.pnpm`, `node_modules`, `dist`, `build`, `out`, `coverage`, `.next`, `.nuxt`, `.turbo`, and `__pycache__`. It also applies `lsp.exclude` patterns and root or nested `.gitignore` rules. Patterns use gitignore syntax, including rules relative to each directory and `!` rules. Built-in exclusions cannot be enabled again. Symbolic-link directories are not visited. Other dot-directories, such as `.github` and `.storybook`, remain allowed.

Set `lsp.exclude` in project or global SuPi configuration:

```json
{
  "lsp": {
    "exclude": ["generated/**", "!generated/keep.ts"]
  }
}
```

An exact semantic request can still route an excluded file when a compatible server is available. This does not add the file to automatic work. Configured diagnostic suppression still applies to diagnostic output.

### Custom server configuration

A custom server needs a command and at least one file type:

```json
{
  "lsp": {
    "servers": {
      "custom": {
        "command": "custom-lsp",
        "args": ["--stdio"],
        "fileTypes": ["custom"],
        "env": { "CUSTOM_LSP_LOG": "debug" },
        "initializationOptions": { "mode": "project" }
      }
    }
  }
}
```

File types do not include a leading dot. If `rootMarkers` is omitted, the server uses the session root.

Disable one language with `lsp.servers.<language>.enabled: false`. Use `/supi-ci-status` from `@mrclrchtr/supi-code-intelligence` to see detected, running, and missing servers.

## What it provides

- `LspRuntimeController` for workspace lifecycle, status, and transition subscriptions
- `WorkspaceLspRuntime` for routing, readiness, semantic operations, tracked files, diagnostics, and recovery
- explicit ready, pending, inactive, disabled, and unavailable registry states
- a `SemanticProvider` adapter for `supi-code-runtime`
- precise rename and code-action edit conversion

Clients, `LspManager`, and the default runtime implementation remain internal.

## Runtime split

`LspRuntimeController` owns:

- language-server detection and startup
- shutdown
- settings and missing-server inventory
- publishing workspace runtime state and aggregate lifecycle transitions
- projecting concrete client readiness into semantic capability state

`WorkspaceLspRuntime` owns:

- hover, definition, references, implementations, symbols, rename, and code actions
- file/workspace readiness waits
- tracked-file lifecycle and workspace change notifications
- diagnostics, summaries, refresh, and recovery
- project-server inventory and file support checks

This separation keeps lifecycle and status distinct from workspace operations. Each controller transition has a monotonic generation and an aggregate server snapshot. Semantic capability is ready while at least one concrete client is ready. A crash or late progress event moves capability back to pending only after the final ready client is lost. The ready runtime owner stays available for lazy routing.

### LSP debug telemetry identity

Retained and persisted LSP debug events may identify local workspaces, servers, files, and requests for protocol diagnosis. All LSP producers share one identity vocabulary:

- `cwd` — absolute workspace root (event level)
- `server` — configured server name, e.g. `typescript`
- `file` — workspace-relative path
- `method` — exact LSP method, e.g. `textDocument/hover`
- `root` — server root, absolute where present

`runtime.transition` events carry `cwd` and a bounded `servers` array (name, status, ready, and an optional process-crash status reason; at most 16 entries) alongside the aggregate counts. `readiness.*` events carry `cwd`, `server`, and `root`; their messages and data never embed raw progress-token values. `request.timing` events carry the exact `method`, `server`, and `cwd`, plus the JSON-RPC error code: the server-reported code for failed requests, and the defined constant `-32095` (`LSP_REQUEST_TIMEOUT_ERROR_CODE`) for local timeouts; cancellations carry no code. `diagnostics.timing` events carry `cwd`, `server`, and a workspace-relative `file` for `sync-file` operations; `refresh-open` stays aggregate. `runtime.recovery` events carry `cwd`, bounded server and route-root identity, an outcome, and elapsed time for process-crash recovery. Diagnostic recovery events keep their existing bounded attempted/restarted server names. `capability.transition` events fire only on semantic ready↔pending transitions and carry `cwd` and the ready state — never for initialize, registration, or unregistration traffic. Code-intelligence events (`code-operation.*`, `workflow.timing`, `ast-scan.timing`) carry `cwd` only.

`ProjectServerInfo.statusReason` is present only for process-crash recovery states: `process-crashed`, `process-crash-recovery-pending`, or `process-crash-recovery-exhausted`. An LSP route is one configured server and workspace root. A route stays in `error` status for all three states.

Semantic evidence operations recover each required, previously running crashed route and wait for the shared replacement. Scoped workspace-symbol operations select routes by operation support and root intersection; unscoped operations select every known supporting route. Required routes start in parallel. File diagnostics can also recover their route. An explicit broad diagnostic refresh can recover crashed routes that retain tracked files in its scope. Server inventory, workspace readiness, and passive diagnostic snapshots do not start recovery. Recovery never cold-starts a route that did not initialize successfully.

Identity strings — `cwd`, `server`, `file`, `method`, and `root` — are bounded to 512 UTF-16 code units (marker included; truncation appends `…`) and server lists to 16 entries. No raw protocol dumps, request/response params, diagnostic text, progress tokens, or unbounded file lists are recorded; `openFiles` stays a count. Identity fields are intentionally **not** secret-redacted — the debug registry still redacts secret keys and values, but server names, workspace-relative files, and method names pass through unredacted so local protocol failures stay diagnosable. The supi-debug package documents this disclosure for retained and persisted events.

## Example

```ts
import { getWorkspaceLspRuntime, toLspPosition } from "@mrclrchtr/supi-lsp/api";

const state = getWorkspaceLspRuntime("/project");
if (state.kind === "ready") {
  const definitions = await state.runtime.definition(
    "src/index.ts",
    toLspPosition(6, 11),
  );
  if (definitions.kind === "completed") {
    // `data: null` is a successful no-definition observation.
    console.log(definitions.data);
  }
}
```

Runtime methods use raw 0-based LSP positions. `toLspPosition()` converts user-facing 1-based coordinates. Read-only semantic and diagnostic methods return `CodeQueryResult<T>` so completed empty protocol responses remain distinct from partial or unavailable requests. A ready runtime owner may contain only lazy routes: workspace semantic readiness requires at least one active ready client, while file readiness requires the routed client for that file to start successfully. Empty client sets and failed routes are unavailable, not vacuously ready.

Semantic and explicit diagnostic operations accept optional shared `CodeRequestControl` metadata. The semantic adapter preserves the exact value through `WorkspaceLspRuntime`. The signal maps to LSP protocol cancellation (`$/cancelRequest`) and the absolute deadline bounds every request and readiness wait. The opaque Debug Operation ID reaches sanitized request and diagnostic timing events. Ambient readiness, lifecycle, capability, and push-diagnostic events have no Debug Operation ID.

## Startup performance

Detected servers start concurrently. In a polyglot workspace, disable unneeded languages in `.pi/supi/config.json` or `~/.pi/agent/supi/config.json`:

```json
{
  "lsp": {
    "servers": {
      "python": { "enabled": false },
      "rust": { "enabled": false }
    }
  }
}
```

If every server definition is disabled, the controller publishes an explicit `disabled` runtime state instead of an empty `ready` runtime. When a ready owner has no active client yet, it stays published for lazy routing while semantic capability remains pending.

## Architecture

```text
supi-code-runtime       canonical contracts + capability broker
        ↑
supi-lsp                semantic lifecycle + Workspace LSP runtime
        ↑
supi-code-intelligence  Workspace session + public code_* tools
```

The private `DefaultWorkspaceLspRuntime` is the single operational seam. It normalizes
paths and coordinates readiness, semantic requests, tracked files, diagnostics, recovery,
and owner-controlled shutdown around the package-internal manager. Clients and the manager
remain hidden from consumers.

See [`docs/adr/0016-workspace-lsp-runtime-interface.md`](../../docs/adr/0016-workspace-lsp-runtime-interface.md).

## Package exports

- `@mrclrchtr/supi-lsp/api` — runtime/controller/config types, registry operations, and automatic path-policy helpers
- `@mrclrchtr/supi-lsp/provider/lsp-semantic-provider` — semantic provider adapter

## Source

- `src/client/` — protocol client, transport, refresh, and requests
- `src/config/` — server configuration and protocol types
- `src/diagnostics/` — stale diagnostics and workspace sentinels
- `src/manager/` — package-internal server pool and routing, diagnostic, and recovery mechanics
- `src/provider/` — semantic, mapping, and refactor adapters
- `src/session/runtime-controller.ts` — lifecycle/status
- `src/session/workspace-lsp-runtime.ts` — `WorkspaceLspRuntime` contracts
- `src/session/runtime-registry.ts` — runtime implementation and registry
