# supi-lsp

Language Server Protocol integration for PI. Provides semantic code-intelligence capabilities consumed by `supi-code-intelligence`.

See also: `packages/supi-code-intelligence/CONTEXT.md` and `packages/supi-code-runtime/CONTEXT.md`.

## Language

**Workspace LSP runtime**:
The workspace-scoped interface that owns file routing, semantic readiness and operations, tracked files, diagnostics, and recovery. It hides clients and the mutable manager, giving callers a deep operational seam with high locality inside `supi-lsp`.
_Avoid_: LspManager, LSP singleton, provider bag, client registry

**Automatic LSP path policy**:
The fixed, runtime-owned path rules for automatic workspace work. It matches paths against the built-in private/generated/dependency directories, `lsp.exclude`, root and nested `.gitignore` rules, and the resolved workspace root. It stops before excluded directories, does not visit symbolic-link directories, and is used for discovery, startup, warm-up, file lists, created-file tracking, guidance, and diagnostic summaries not tied to one request. Regular symbolic-link files remain allowed when their target is a file. The runtime creates one policy at startup and creates a new one on reload.
_Avoid_: local LSP skip set, one-off exclude check, explicit-file policy

**Automatic LSP intent**:
Work that SuPi performs from workspace state without one exact user-selected file: project detection, route startup, warm-up, file lists, created-file tracking, guidance, and diagnostic summaries not tied to one request. It uses the Automatic LSP path policy.
_Avoid_: explicit semantic request, unrestricted workspace walk

**Explicit LSP intent**:
A semantic request for one exact file selected by the user or agent. It may route a file excluded from automatic work. This exception does not add the file to automatic discovery, warm-up, tracking, file lists, or guidance; configured diagnostic suppression still applies to diagnostic output.
_Avoid_: automatic source support, ambient request, excluded means unavailable

**Source baseline**:
The latest complete set of automatic-policy-eligible files with a configured LSP extension. The first complete inventory establishes it without treating existing files as created; a limited inventory does not replace it.
_Avoid_: sentinel snapshot, current file list, source mtime snapshot

**Created-source queue**:
A deduplicated queue of source paths found after the Source baseline. A broad diagnostic refresh processes up to 256 paths, retains out-of-scope and unavailable paths, and removes paths after tracked, already-tracked, or unsupported outcomes.
_Avoid_: source change list, unbounded tracking queue, diagnostic evidence

**Limited source discovery**:
A source inventory that stops at the safety limit or a material filesystem error. It reports its reason and observed count, does not infer additions or removals, and does not replace the Source baseline.
_Avoid_: complete source scan, exact omitted count, source failure

**LSP route**:
The stable identity of one configured language server for one workspace root. A route can continue across a failed server process and its replacement. Lifecycle, status, and recovery state belong to the route, not to one process generation.
_Avoid_: server, client route, project server, process directory, working directory

**Required LSP route**:
A known LSP route that supports a requested operation and can contribute evidence within its scope. Unscoped demand requires every supporting route.
_Avoid_: eligible route, relevant server, all configured servers

**Broad diagnostic refresh**:
An explicit diagnostic evidence operation for tracked files in the full workspace or one selected directory. It can consider more than one LSP route and can select crashed routes from retained tracked-file paths.
_Avoid_: workspace-runtime refresh, workspace-wide proof, passive snapshot

**File diagnostic refresh**:
An explicit diagnostic evidence operation for one exact file. It routes that file directly and does not depend on broad-refresh retained-file selection.
_Avoid_: file-runtime refresh, broad diagnostic refresh, passive file snapshot

**Diagnostic recovery attempt**:
A best-effort workspace-runtime operation that clears pull state, refreshes active clients, and may restart an affected push-only client on a protocol-stall signal (readiness-stall or protocol-errors), never on unconfirmed evidence alone and never pull-capable routes. Its attempted-client count names targets, not confirmed successful diagnostic refreshes.
_Avoid_: recovered diagnostics, freshness proof, per-client success inference

**Process-crash recovery**:
The route-level recovery for a previously running LSP client whose server process exits or emits a process error. Ordinary evidence demand starts and waits for one shared replacement for each required crashed route; explicit health refresh can retry an exhausted route once per call. Passive status, inventory, and diagnostic snapshots do not start recovery. It is separate from diagnostic recovery, which responds to diagnostic evidence or protocol stalls.
_Avoid_: diagnostic recovery, startup retry, crash loop

**Initial-start retry**:
The explicit-health-refresh attempt to start a route whose initial client startup failed. It is separate from process-crash recovery, gets one attempt per route per refresh call, and reports `recovered` or `retry-failed`; a failed retry recommends another explicit `refresh`.
_Avoid_: process-crash replacement, unlimited startup loop, diagnostic confirmation

**Process-crash refresh outcome**:
The bounded route-level report that an explicit health refresh gives for each process-crash route it attempts or skips. It has exact recovered, skipped, failed, and exhausted counts, up to 16 entries, and an exact omitted-entry count. Each entry has the configured server name, workspace-relative root, stable outcome, and a typed next action for non-recovered routes. A skipped route uses `use-exact-file`; a failed or exhausted route uses `refresh`.
_Avoid_: current server status, aggregate client count, passive inventory

**LSP runtime controller**:
The lifecycle/status module for one workspace. It starts and shuts down language-server infrastructure, publishes runtime state, and reports detected project servers. It does not own semantic workflow policy.
_Avoid_: Workspace LSP runtime, semantic provider, query router

**Runtime state**:
The explicit registry state for a workspace: ready, pending, inactive, disabled, or unavailable. Disabled means no enabled language-server definitions remain; a ready runtime may still have no proactively started clients because configured routes can start lazily. Runtime readiness and semantic readiness are therefore distinct.
_Avoid_: nullable runtime, implicit startup, manager availability, inferring semantic evidence from runtime presence

**Concrete semantic readiness**:
Evidence that a live LSP client is ready: workspace readiness requires at least one active ready client, while file readiness requires the routed client for that file to exist and finish startup. An empty client set and a routed `null` result are unavailable, never vacuously ready. Failed workspace warm-up leaves the runtime owner published and semantic registration pending so a lazy file route may still start later.
_Avoid_: owner readiness, `Promise.all([])` readiness, treating a configured route as a live client

**Semantic input barrier**:
A freshness condition that requires known changes to the inputs of each Required LSP route to be synchronized before semantic evidence can be trusted. It covers reported workspace changes and detected disk changes to open documents, but is not a complete workspace snapshot.
_Avoid_: readiness probe, diagnostic refresh, workspace-wide freshness

**Diagnostic evidence barrier**:
A freshness boundary that invalidates earlier diagnostic evidence after a document or workspace change. Only evidence confirmed for the current document scope can cross it; an old cache or ambient publication cannot.
_Avoid_: cache clear, quiet period, clean result, Semantic input barrier

**TypeScript program membership**:
The live configured or inferred TypeScript programs that contain a file, in the model behind the running server's diagnostics. Distinct from config coverage state, which only checks the nearest tsconfig.
_Avoid_: nearest-tsconfig coverage, config grouping, project meaning client route

**Diagnostic impact scope**:
The evidence set that a TypeScript file change must make suspect: the containing programs, transitive project-reference dependents, and conservative fallbacks for unresolved membership.
_Avoid_: workspace-wide suspect set, changed-file-only scope

**Confirmed diagnostic evidence**:
Diagnostic evidence from a validated request that satisfies the Semantic input barrier and matches the current document synchronization and evidence revision. It can support a completed or clean result for that file.
_Avoid_: fresh evidence, current snapshot, semantic completion

**Tentative diagnostic evidence**:
Current diagnostic data that has not been confirmed by a diagnostic request. Non-empty data can be shown as partial evidence; empty data cannot support a clean result.
_Avoid_: confirmed evidence, final diagnostics, hidden error, clean result

**Observed diagnostic evidence**:
Diagnostic data accepted from an ambient push publication. It can provide useful partial output, but it cannot confirm diagnostic completion or replace request-confirmed evidence.
_Avoid_: confirmed push, final push, publication proof

**Diagnostic request adapter**:
An internal route adapter that collects and normalizes file diagnostics through a request. It supplies confirmation only after the shared engine checks document freshness.
_Avoid_: server exception, push confirmer, workspace proof

**Owned transport lifetime**:
The transport lifetime of an explicit diagnostic request is separate from the caller's wait. Supersession drops queued work and stops future adapter phases without cancelling an active protocol request; the route stays occupied until actual settlement or connection disposal. An owner timeout attempts protocol cancellation but does not prove that the backend stopped.
_Avoid_: caller wait, result deadline, treating cancellation as settlement

**Later ambient publication**:
A later ambient diagnostic publication for the same document synchronization. It remains an observation and does not confirm the synchronization.
_Avoid_: replacement result, confirmed result, publication proof

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
Whether a TypeScript or JavaScript-family file is inside the compilation scope of its nearest tsconfig.json or jsconfig.json. User-facing statuses: `covered`, `not covered`, `no-config`, `out-of-tree` — rendered in code_health file scope as "Tsconfig: covered by <config>". Other-language files have no config coverage state and no Tsconfig label. Machine vocabulary (`included`/`excluded`) appears in debug events and code; the mapping is 1:1. A decision always carries its basis; never report a bare boolean.
_Avoid_: "file scope" as the rendered term (collides with the evidence-scope line), excluded-without-basis, "in project" as a boolean, labeling Python or another non-TypeScript file with Tsconfig coverage

**Scope decision basis**:
The mechanism that produced a config coverage state for a TypeScript or JavaScript-family file: `fileNames` (parse-time file set), `explicit` (files array), `include-pattern`, `default-include`, `exclude-pattern`, or `extension` (unsupported file type, checked before any pattern). The basis explains why a post-parse file is covered although it never appeared in the parse-time file set. Decisions are computed by `getFileScopeDecision` and aggregated per recovery pass in the `diagnostics.scope` debug event; the rendered code_health line carries no basis — the event is the structured reason. The boolean filter (`isFileExcludedByTsconfig`) stays the source of truth for automatic diagnostic filtering and returns false for other-language files.
_Avoid_: "the include pattern" as the only mechanism, untyped decision reasons, applying a TypeScript config to another language

**Tracked-file evidence**:
Diagnostic evidence bounded by the client's tracked documents. A file created after the tracked set was last updated is absent until a refresh pulls it; the evidence line in health output is therefore explicitly bounded (`tracked-file bound`). The workspace refresh path discovers files created since the last snapshot pass and pulls them, so a created file's errors appear on the next settled refresh.
_Avoid_: "current diagnostics", "the latest evidence"

**Refresh-attempt evidence**:
The diagnostic evidence produced by the just-run recovery pass. It can differ from tracked-file evidence inside one health call; the two must be labeled distinctly in output.
_Avoid_: conflating the health refresh line with the evidence snapshot
