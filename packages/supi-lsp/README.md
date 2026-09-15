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

The table is a historical initialize-handshake audit performed on 2026-08-21 against the locally installed server versions. It is not a current retest. The TypeScript row also records a separate issue 407 adapter verification on 2026-09-13. That verification did not retest the other server binaries; their audit versions and statuses remain historical. The handshake is authoritative and can report a different mode after an upgrade; treat rows marked `unverified` as unknown until a probe confirms them. Pull-capability facts come from the official LSP specification (pull diagnostics are a 3.17 feature; 3.18 is the current specification at microsoft.github.io/language-server-protocol/specifications/lsp/3.18/specification).

| Language | Server binary | Pull diagnostics (probe) | Built-in SuPi mode | Notes |
|---|---|---|---|---|
| TypeScript / JavaScript | `typescript-language-server` 5.3.0 (audit, 2026-08-21); 6.0.0 (adapter verification, 2026-09-13) | No standard pull in the recorded checks | TypeScript request adapter when eligible; push observation otherwise | The 5.3.0 capability row is historical. The 6.0.0 adapter is described below. |
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

When a server sends `workspace/diagnostic/refresh`, SuPi returns `null` immediately. It then invalidates diagnostic evidence only and refreshes the owning client's tracked documents in the background. Unchanged open documents keep their input synchronization; SuPi sends no no-op `didChange`, `didClose`, or `didOpen`. It uses native pull or the tested TypeScript request adapter when available. Push-only routes keep partial or unconfirmed evidence. Actual disk changes use the normal document synchronization path. Overlapping refresh requests share one active pass and one newer pending demand; an active diagnostic transport stays owned until it settles. The refresh covers open, cached, and failed tracked documents. SuPi does not add workspace-wide `workspace/diagnostic` pulls.

Protocol support is separate from the configured mode. A server may support pull diagnostics and still use SuPi's push mode because the built-in configuration does not enable pull mode.

The LSP 3.18 specification adds `Diagnostic.message` markup content, guarded by the client capability `textDocument.diagnostic.markupMessageSupport`; SuPi's validator already accepts plaintext and markdown messages but does not advertise the capability. Other 3.18 features (snippet text edits, inline completion, folding-range refresh, multi-range formatting) are outside the diagnostic surface and are not implemented.

### Diagnostic evidence policy

See [`ADR 0022`](../../docs/adr/0022-request-confirmed-lsp-agnostic-diagnostics.md) for the decision record. SuPi uses one shared diagnostic engine with optional internal request adapters. It selects one source for each file:

| Source | Used when | Evidence result |
|---|---|---|
| Native LSP pull | A valid static or dynamic `diagnosticProvider` applies to the file. | A validated current report can confirm that file. |
| TypeScript request | The supported TypeScript route advertises `typescript.tsserverRequest` and the file type matches its configuration. | A complete validated phase collection can confirm that file. |
| Ambient push | No request source applies, or a request collection fails and a push is available. | Observation only; non-empty data may be partial, but it cannot confirm clean. |

Native pull uses `textDocument/diagnostic`. The client validates full and unchanged reports, carries result IDs, and applies a report only when the document synchronization and evidence revision are current. A valid native provider has priority over the TypeScript adapter when both apply. The adapter is internal and does not change the server's advertised capabilities.

The TypeScript adapter was verified with `typescript-language-server` 6.0.0 and TypeScript 6.0.3. It uses the running server's tsserver through `workspace/executeCommand` and `typescript.tsserverRequest`. It collects `syntacticDiagnosticsSync`, `semanticDiagnosticsSync`, and `suggestionDiagnosticsSync` in order, then validates and combines all three phases. It uses execution target `0` and does not start a second compiler. Conversion validates positions and categories and carries supported tags and related information. A missing, failed, malformed, cancelled, or superseded phase does not establish request evidence.

This adapter applies only when the command is `typescript-language-server`, the route advertises `typescript.tsserverRequest`, and the file suffix matches the route's `fileTypes`. The 6.0.0 verification does not retest other server binaries. Do not infer request support from a language name. Other routes need a valid native pull provider or remain on the ambient push path.

Push diagnostics are asynchronous and may omit a document version. An unversioned push for an open document is accepted only after that document's local sync moment; pushes for closed or untracked URIs, and pushes before that moment, stay fail-closed. This gate blocks some stale messages. It does not confirm diagnostic completion. Every accepted push remains observed or tentative. A document version, publication count, quiet interval, or later republish does not confirm it. Non-empty push diagnostics may be returned as partial evidence. An empty push stays unconfirmed or unavailable. Ambient pushes do not replace request-confirmed cache entries.

A request is file-scoped. A successful TypeScript collection confirms only the requested file and current document generation. It is not a check of every file in a TypeScript program, a workspace, or all language servers. Workspace refresh reports exact tracked-file coverage for `requested`, `confirmed`, `unconfirmed`, `failed`, and `removed` documents. A missing or removed file is reported in that refresh and is not kept in later tracked-file snapshots. A broad `code_health` maintenance pass can refresh active tracked files outside a requested directory; its refresh-attempt evidence is separate from the later diagnostic result scope and coverage. `code_health` keeps these coverage states separate from diagnostic entries.

Refresh and file collection share synchronization, evidence-revision, deadline, cancellation, cache, and response-validation rules. Duplicate requests for one route, file, synchronization, and revision share one job. The scheduler runs one request at a time per client route and allows at most 32 pending jobs. Refresh collection is sequential and stops at its shared deadline; unfinished files remain explicit in the coverage counts. The default refresh budget is 3,000 ms and the default push quiet window is 200 ms. The quiet window only ends an observation wait; it cannot confirm diagnostics.

Caller cancellation or deadline stops only that caller's wait. Explicit diagnostic requests use an owned transport lifetime: supersession drops queued jobs and stops future adapter phases but does not cancel an active protocol request. The route stays occupied until actual settlement or connection disposal. The owner timeout attempts protocol cancellation but does not prove that the backend stopped. The owner bound is at least 30 seconds (or a larger collection budget). A result from an obsolete document generation is discarded. Ordinary semantic requests still pass caller cancellation to the protocol transport.

If another request first opens a document during an active semantic or diagnostic request, the client can synchronize and repeat the request once. The retry retains the caller's original signal and deadline. Content, workspace, close, and lifecycle changes still reject stale results. A diagnostic retry collects new request evidence; it does not promote an old cache. This retry is not route recovery. A second enrollment during the retry still rejects the result. Semantic failure reasons state whether the retry failed or was exhausted. The `semantic-request.enrollment-retry` debug event records retry start and outcome with the public call's opaque operation ID, when supplied. A completed RPC alone does not establish accepted semantic evidence.

Diagnostic collection does not close and reopen a document to obtain confirmation. It does not send a no-op `didChange` for that purpose. Refresh retains unchanged documents and their current server state, and resynchronizes changed or invalidated documents. A client restart may reopen tracked documents to restore client state; that is recovery, not diagnostic confirmation.

Server readiness follows LSP work-done progress: a created progress token is pending and never blocks readiness; an observed `begin` marks active work and makes the client not ready until its `end` or the bounded per-token timeout.

An explicit diagnostic refresh retries failed startup and exhausted process-crash routes in scope. It returns separate bounded startup-retry and process-crash reports. Healthy routes are reused, and process readiness is not diagnostic evidence. Recovery keeps the ADR 0020 rule: restart a push-only route only for a protocol-stall signal, not for unconfirmed evidence. A route with native pull or the TypeScript request adapter is not restarted because an ambient push is absent. Passive health display does not restart routes.

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

Tsconfig and jsconfig filtering applies only to TypeScript and JavaScript-family files (`.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`, `.mjs`, and `.cjs`). Other-language diagnostics are not filtered by a nearby TypeScript or JavaScript project config. Automatic path exclusions and configured diagnostic suppression still apply. A single-file health result omits the `Tsconfig` coverage line for other languages.

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

`runtime.transition` events carry `cwd` and a bounded `servers` array (name, status, ready, and an optional process-crash status reason; at most 16 entries) alongside the aggregate counts. `readiness.*` events carry `cwd`, `server`, and `root`; their messages and data never embed raw progress-token values. `request.timing` events carry the exact `method`, `server`, and `cwd`, plus the JSON-RPC error code: the server-reported code for failed requests, and the defined constant `-32095` (`LSP_REQUEST_TIMEOUT_ERROR_CODE`) for local timeouts; cancellations carry no code. `diagnostics.timing` events carry `cwd`, `server`, and a workspace-relative `file` for `sync-file` operations; `refresh-open` stays aggregate. Their `collection` value identifies the source, such as `pull`, `typescript`, `mixed`, or `push`. `diagnostics.publication` keeps bounded publication counts for observation; a count or late publication does not promote confirmation. `runtime.recovery` events carry `cwd`, bounded server and route-root identity, an outcome, and elapsed time for process-crash recovery. Diagnostic recovery events keep their existing bounded attempted/restarted server names. `capability.transition` events fire only on semantic ready↔pending transitions and carry `cwd` and the ready state — never for initialize, registration, or unregistration traffic. Code-intelligence events (`code-operation.*`, `workflow.timing`, `ast-scan.timing`) carry `cwd` only.

`ProjectServerInfo.statusReason` is present only for process-crash recovery states: `process-crashed`, `process-crash-recovery-pending`, or `process-crash-recovery-exhausted`. An LSP route is one configured server and workspace root. A route stays in `error` status for all three states.

Semantic evidence operations recover each required, previously running crashed route and wait for the shared replacement. Scoped workspace-symbol operations select routes by operation support and root intersection; unscoped operations select every known supporting route. Required routes start in parallel. File diagnostics can also recover their route. An explicit health refresh can retry failed startup and crashed routes in its scope, including routes without retained files, and can discover configured servers that are now available in Pi's environment. Server inventory, workspace readiness, and passive diagnostic snapshots do not start recovery. A healthy route is reused, and an explicit refresh can restore its automatic process-crash attempt budget after observing readiness. Ordinary semantic and diagnostic requests keep the automatic recovery limit. Recovery never claims diagnostic evidence from process readiness alone.

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

Semantic and explicit diagnostic operations accept optional shared `CodeRequestControl` metadata. The semantic adapter preserves the exact value through `WorkspaceLspRuntime`. Semantic requests pass caller cancellation to the LSP transport. Explicit diagnostic requests use the owned transport lifetime described above: caller cancellation or a caller deadline ends only that caller's wait, and supersession does not cancel an active protocol request. The route stays occupied until actual settlement or connection disposal; an owner timeout attempts protocol cancellation but does not prove that the backend stopped. The opaque Debug Operation ID reaches sanitized request and diagnostic timing events. Ambient readiness, lifecycle, capability, and push-diagnostic events have no Debug Operation ID.

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

- `src/client/` — protocol client, transport, diagnostic request adapters, refresh, and requests
- `src/config/` — server configuration and protocol types
- `src/diagnostics/` — stale diagnostics and workspace sentinels
- `src/manager/` — package-internal server pool and routing, diagnostic, and recovery mechanics
- `src/provider/` — semantic, mapping, and refactor adapters
- `src/session/runtime-controller.ts` — lifecycle/status
- `src/session/workspace-lsp-runtime.ts` — `WorkspaceLspRuntime` contracts
- `src/session/runtime-registry.ts` — runtime implementation and registry
