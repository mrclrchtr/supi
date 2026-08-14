# LSP diagnostic recovery and debug identity

SuPi keeps diagnostic freshness file-local.

Pull-capable servers provide the strongest post-invalidation evidence. Push-only servers may receive one targeted client restart per affected client route during an explicit refresh, and at most one restart per workspace invalidation generation. Each restart has a fixed 5-second startup bound. The result stays partial when confirmation fails.

Work-done progress creation does not make a client active. The client becomes active at `begin`.

LSP debug events may include server, workspace, file, method, and root identity for local diagnosis. The implemented contract (issue #322):

- Event-level `cwd` is the absolute workspace root; `file` fields are workspace-relative; server `root` stays absolute where present; `server` is the configured server name; `method` is the exact LSP method.
- `runtime.transition` adds `cwd` and a bounded `servers` array (name, status, ready; at most 16 entries).
- `readiness.*` events add `cwd`, `server`, and `root`; raw progress-token values never appear in messages or data.
- `request.timing` adds the exact `method`, `server`, `cwd`, and the JSON-RPC error code (the server-reported code for failed requests; the defined constant `-32095` for local timeouts; none for cancellations); `operationId` stays owned-requests-only.
- `diagnostics.timing` adds `cwd`, `server`, and a workspace-relative `file` for `sync-file` operations; `refresh-open` stays aggregate and never includes diagnostic text or content.
- `runtime.recovery` adds `cwd` and bounded attempted/restarted server names; a cancelled pass records the server names still running at cancellation, while restart identity requires the pass result.
- `capability.transition` events fire only on semantic ready↔pending transitions with `cwd` and the ready state; no initialize, register, or unregister events exist.
- Identity strings — `cwd`, `server`, `file`, `method`, and `root` — are bounded to 512 UTF-16 code units (marker included; truncation appends `…`); identity fields are not secret-redacted, while secret keys and values stay redacted by the registry.

The existing debug registry still protects secret values.

## Considered options

- Trusting the next unversioned push was rejected because an old publication can cross the invalidation boundary.
- Restarting every client or restarting during passive status display was rejected because it adds avoidable CPU, memory, and latency cost.
- Treating one current file as proof for a whole client or workspace was rejected because cross-file diagnostics can remain stale.
- Keeping all debug identities hidden was rejected for this development workflow because it makes local protocol failures harder to diagnose.
