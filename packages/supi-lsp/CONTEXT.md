# supi-lsp

Language Server Protocol integration for PI. Provides semantic code-intelligence capabilities consumed by `supi-code-intelligence`.

See also: `packages/supi-code-intelligence/CONTEXT.md` and `packages/supi-code-runtime/CONTEXT.md`.

## Language

**Workspace LSP runtime**:
The workspace-scoped interface that owns file routing, semantic readiness and operations, tracked files, diagnostics, and recovery. It hides clients and the mutable manager, giving callers a deep operational seam with high locality inside `supi-lsp`.
_Avoid_: LspManager, LSP singleton, provider bag, client registry

**Diagnostic recovery attempt**:
A best-effort workspace-runtime operation that clears pull state, refreshes active clients, and may restart clients for a suspected stale cluster. Its attempted-client count names targets, not confirmed successful diagnostic refreshes.
_Avoid_: recovered diagnostics, freshness proof, per-client success inference

**LSP runtime controller**:
The lifecycle/status module for one workspace. It starts and shuts down language-server infrastructure, publishes runtime state, and reports detected project servers. It does not own semantic workflow policy.
_Avoid_: Workspace LSP runtime, semantic provider, query router

**Runtime state**:
The explicit registry state for a workspace: ready, pending, inactive, disabled, or unavailable. Disabled means no enabled language-server definitions remain; a ready runtime may still have no proactively started clients because configured routes can start lazily. Runtime readiness and semantic readiness are therefore distinct.
_Avoid_: nullable runtime, implicit startup, manager availability, inferring semantic evidence from runtime presence

**Concrete semantic readiness**:
Evidence that a live LSP client is ready: workspace readiness requires at least one active ready client, while file readiness requires the routed client for that file to exist and finish startup. An empty client set and a routed `null` result are unavailable, never vacuously ready. Failed workspace warm-up leaves the runtime owner published and semantic registration pending so a lazy file route may still start later.
_Avoid_: owner readiness, `Promise.all([])` readiness, treating a configured route as a live client
