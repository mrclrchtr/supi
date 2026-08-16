# supi-lsp

Language Server Protocol integration for PI. Provides semantic code-intelligence capabilities consumed by `supi-code-intelligence`.

See also: `packages/supi-code-intelligence/CONTEXT.md` and `packages/supi-code-runtime/CONTEXT.md`.

## Language

**Workspace LSP runtime**:
The workspace-scoped interface that owns file routing, semantic readiness and operations, tracked files, diagnostics, and recovery. It hides clients and the mutable manager, giving callers a deep operational seam with high locality inside `supi-lsp`.
_Avoid_: LspManager, LSP singleton, provider bag, client registry

**Diagnostic recovery attempt**:
A best-effort workspace-runtime operation that clears pull state, refreshes active clients, and may restart an affected push-only client on a protocol-stall signal (readiness-stall or protocol-errors), never on unconfirmed evidence alone and never pull-capable routes. Its attempted-client count names targets, not confirmed successful diagnostic refreshes.
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

**Config coverage state**:
Whether a file is inside the compilation scope of its nearest tsconfig.json or jsconfig.json. User-facing statuses: `covered`, `not covered`, `no-config`, `out-of-tree` — rendered in code_health file scope as "Tsconfig: covered by <config>". Machine vocabulary (`included`/`excluded`) appears in debug events and code; the mapping is 1:1. A decision always carries its basis; never report a bare boolean.
_Avoid_: "file scope" as the rendered term (collides with the evidence-scope line), excluded-without-basis, "in project" as a boolean

**Scope decision basis**:
The mechanism that produced a config coverage state: `fileNames` (parse-time file set), `explicit` (files array), `include-pattern`, `default-include`, `exclude-pattern`, or `extension` (unsupported file type, checked before any pattern). The basis explains why a post-parse file is covered although it never appeared in the parse-time file set. Decisions are computed by `getFileScopeDecision` and aggregated per recovery pass in the `diagnostics.scope` debug event; the rendered code_health line carries no basis — the event is the structured reason. The boolean filter (`isFileExcludedByTsconfig`) stays the source of truth for diagnostic filtering.
_Avoid_: "the include pattern" as the only mechanism, untyped decision reasons

**Tracked-file evidence**:
Diagnostic evidence bounded by the client's tracked documents. A file created after the tracked set was last updated is absent until a refresh pulls it; the evidence line in health output is therefore explicitly bounded (`tracked-file bound`). The workspace refresh path discovers files created since the last snapshot pass and pulls them, so a created file's errors appear on the next settled refresh.
_Avoid_: "current diagnostics", "the latest evidence"

**Refresh-attempt evidence**:
The diagnostic evidence produced by the just-run recovery pass. It can differ from tracked-file evidence inside one health call; the two must be labeled distinctly in output.
_Avoid_: conflating the health refresh line with the evidence snapshot
