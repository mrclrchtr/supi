# LSP diagnostic recovery and debug identity

SuPi keeps diagnostic freshness file-local.

Pull-capable servers provide the strongest post-invalidation evidence. Push-only servers confirm fresh evidence through a time gate and a reopen-resync fallback, and may receive one targeted client restart per affected client route during an explicit refresh when the route shows a protocol-stall signal — at most one restart per workspace invalidation generation. Each restart has a fixed 5-second startup bound. The result stays partial when confirmation fails.

Unversioned push diagnostics (`publishDiagnostics` without `version`, as sent by `typescript-language-server`) are accepted for an open document only when they arrive after that document's sync moment — the client-side instant when the client sent the `didChange`, `didOpen`, or watched-file invalidation that produced the server's response. An accepted unversioned push is re-stamped with the document's current `synchronizationId` and `evidenceRevision`, so it proves that document's synchronization. Unversioned pushes for closed or untracked URIs stay fail-closed, and so do pushes that arrive before a URI's sync moment (they can cross the invalidation boundary). The client holds the authoritative version for open documents, which bounds the stale-publication race: a publication computed before a sync that arrives after its moment is accepted once, and the next synchronization re-gates it.

On push-only routes, an explicit refresh first classifies open documents by disk content instead of resynchronizing every document that lacks fresh evidence. A document whose disk fingerprint still matches its open content and whose evidence revision is current stays in the server's state: with current evidence it is reused; without current evidence it is retained — it keeps its synchronization and the settle waits for the server's existing pipeline. A no-op `didChange` can never confirm such a document (`typescript-language-server` skips empty-to-empty updates), and sending one would invalidate in-progress evidence and force full-program re-checks; in large workspaces that storm plus the reopen fallback reset the server pipeline repeatedly and no settle window could ever confirm (#344). Documents outside the current evidence revision still resynchronize: their stale revision cannot produce fresh evidence without an explicit sync. Server-requested refreshes keep their forced full resynchronization.

On push-only routes, an open document still unconfirmed after the settle window is closed and reopened over the protocol (`didClose` + `didOpen` with current content) only when this pass resynchronized it with `didChange` — a clean file receives no push on `didChange` at all, while `typescript-language-server` publishes on `didOpen`. Documents the pass reused or retained wait for the server's existing pipeline; reopening them would cancel in-progress server work without fixing any publish gap. The reopen keeps the diagnostic cache entry and version history intact and does not discard other documents' server state; evidence then settles again within a bounded second window using the same `maxWaitMs` as the initial `refresh-open` pass. The single-file `sync-file` path keeps its fixed 1 s retry window.

Recovery restarts a push-only client only on a protocol-stall signal, never on unconfirmed evidence alone:

- readiness stall: a running client that never became ready within the 5 s startup bound, or a work-done-progress token created without a `begin` within the per-token bound (`readinessTimeoutMs`, default 10 s);
- protocol errors: repeated JSON-RPC request failures — three or more `server_not_initialized` (-32002), invalid-request (-32600), or local-timeout (-32095) outcomes on the current client generation. Caller-imposed deadline expiries do not count.

Both thresholds are implementation choices recorded here; the second-settle budget and the failure threshold may change with observed telemetry.

Work-done progress creation does not make a client active. The client becomes active at `begin`.

LSP debug events may include server, workspace, file, method, and root identity for local diagnosis. The implemented contract (issue #322):

- Event-level `cwd` is the absolute workspace root; `file` fields are workspace-relative; server `root` stays absolute where present; `server` is the configured server name; `method` is the exact LSP method.
- `runtime.transition` adds `cwd` and a bounded `servers` array (name, status, ready; at most 16 entries).
- `readiness.*` events add `cwd`, `server`, and `root`; raw progress-token values never appear in messages or data.
- `request.timing` adds the exact `method`, `server`, `cwd`, and the JSON-RPC error code (the server-reported code for failed requests; the defined constant `-32095` for local timeouts; none for cancellations); `operationId` stays owned-requests-only.
- `diagnostics.timing` adds `cwd`, `server`, and a workspace-relative `file` for `sync-file` operations; `refresh-open` stays aggregate and never includes diagnostic text or content. When the reopen-resync fallback runs, the event records the `reopen` count.
- `runtime.recovery` adds `cwd` and bounded attempted/restarted server names; a cancelled pass records the server names still running at cancellation, while restart identity requires the pass result. A restart records the stall signal that triggered it (`reason: "readiness-stall" | "protocol-errors"`).
- `capability.transition` events fire only on semantic ready↔pending transitions with `cwd` and the ready state; no initialize, register, or unregister events exist.
- Identity strings — `cwd`, `server`, `file`, `method`, and `root` — are bounded to 512 UTF-16 code units (marker included; truncation appends `…`); identity fields are not secret-redacted, while secret keys and values stay redacted by the registry.

The existing debug registry still protects secret values.

## Considered options

- Trusting every unversioned push was rejected because an old publication can cross the invalidation boundary; the sync-moment time gate (see above) bounds that concern for open documents, and fail-closed stays for closed and untracked URIs and for arrivals before a sync moment.
- `diagnostics.eagerClear` was considered: publish an empty set on every change so clean files confirm on `didChange`. Rejected because an empty push can precede the real diagnostics (multiple publishes per version are normal on tsserver), and because it would change server behavior globally rather than client policy.
- Restarting every client or restarting during passive status display was rejected because it adds avoidable CPU, memory, and latency cost.
- Restarting push-only clients on unconfirmed evidence alone was rejected: the reopen-resync fallback recovers unconfirmed documents without discarding warm server state, so recovery restarts are reserved for protocol-stall signals.
- Treating one current file as proof for a whole client or workspace was rejected because cross-file diagnostics can remain stale.
- Keeping all debug identities hidden was rejected for this development workflow because it makes local protocol failures harder to diagnose.
