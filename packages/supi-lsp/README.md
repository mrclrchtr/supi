<div align="center">
  <a href="https://github.com/mrclrchtr/supi/tree/main/packages/supi-lsp">
    <img src="https://raw.githubusercontent.com/mrclrchtr/supi/main/packages/supi-lsp/assets/social-preview.png" alt="SuPi LSP" width="100%">
  </a>
</div>

# @mrclrchtr/supi-lsp

Language Server Protocol runtime library for the [pi coding agent](https://github.com/earendil-works/pi).

This package is library-only. It registers no model-callable tools; `@mrclrchtr/supi-code-intelligence` owns the public `code_*` family.

## Install

```bash
npm install @mrclrchtr/supi-lsp
```

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

The old `lsp.enabled` and `lsp.active` settings are deprecated and ignored. If every server definition is disabled, the controller publishes an explicit `disabled` runtime state instead of an empty `ready` runtime. When a ready owner has no active client yet, it stays published for lazy routing while semantic capability remains pending.

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

- `@mrclrchtr/supi-lsp/api` — runtime/controller/config types and registry operations
- `@mrclrchtr/supi-lsp/provider/lsp-semantic-provider` — semantic provider adapter

## Source

- `src/client/` — protocol client, transport, refresh, and requests
- `src/config/` — server configuration and protocol types
- `src/diagnostics/` — stale diagnostics and workspace sentinels
- `src/manager/` — package-internal server pool and routing, diagnostic, and recovery mechanics
- `src/provider/` — semantic and refactor adapters
- `src/session/runtime-controller.ts` — lifecycle/status
- `src/session/runtime-registry.ts` — `WorkspaceLspRuntime` and registry
