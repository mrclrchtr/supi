# supi-lsp

Language Server Protocol integration for PI. Provides semantic code-intelligence capabilities consumed by `supi-code-intelligence`.

See also: `packages/supi-code-intelligence/CONTEXT.md` and `packages/supi-code-runtime/CONTEXT.md`.

## Language

**Workspace LSP runtime**:
The workspace-scoped interface that owns file routing, semantic readiness and operations, tracked files, diagnostics, and recovery. It hides clients and the mutable manager, giving callers a deep operational seam with high locality inside `supi-lsp`.
_Avoid_: LspManager, LSP singleton, provider bag, client registry

**Diagnostic recovery attempt**:
A best-effort workspace-runtime operation that clears pull state, refreshes active clients, and may restart unconfirmed push-only clients, including routes found by the supplemental stale-cluster heuristic. Its attempted-client count names targets, not confirmed successful diagnostic refreshes.
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

**Diagnostic evidence barrier**:
A freshness boundary that invalidates earlier diagnostic evidence after a document or workspace change. Evidence may cross the boundary only when the current document scope is confirmed; an old cache or an unversioned publication does not cross it.
_Avoid_: cache clear, quiet period, clean result, workspace-wide freshness

**Push-only diagnostic recovery**:
A bounded recovery path for a server that publishes diagnostics but cannot answer pull requests. It may restart an affected client during an explicit refresh, but it must keep file-local freshness and report partial evidence when confirmation fails. Each route restarts at most once per invalidation generation, and the replacement startup has a fixed 5-second bound.
_Avoid_: trust-next-push, automatic restart on status display, recovered diagnostics, restarting pull-capable routes

**Progress readiness**:
The SuPi readiness interpretation of LSP work-done progress. A created progress token is pending, an observed `begin` token represents active work, and an observed `end` token completes that work.
_Avoid_: created means active, token timeout means server failure, owner readiness

**Identity-bearing debug event**:
A retained or persisted LSP debug event that may include server, workspace, file, method, or root identity to support local protocol diagnosis. Event-level `cwd` is the absolute workspace root, `file` fields are workspace-relative, and server `root` stays absolute where present. Identity strings are bounded to 512 UTF-16 code units (marker included) and server lists to 16 entries; readiness events never embed raw progress-token values; `capability.transition` fires only on semantic ready↔pending transitions. Identity fields are intentionally not secret-redacted.
_Avoid_: sanitized identity-free event, public tool evidence, raw protocol dump
