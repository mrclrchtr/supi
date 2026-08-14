# LSP diagnostic recovery and debug identity

SuPi keeps diagnostic freshness file-local.

Pull-capable servers provide the strongest post-invalidation evidence. Push-only servers may receive one targeted client restart per affected client route during an explicit refresh, and at most one restart per workspace invalidation generation. Each restart has a fixed 5-second startup bound. The result stays partial when confirmation fails.

Work-done progress creation does not make a client active. The client becomes active at `begin`.

LSP debug events may include server, workspace, file, and path identity for local diagnosis. The existing debug registry still protects secret values.

## Considered options

- Trusting the next unversioned push was rejected because an old publication can cross the invalidation boundary.
- Restarting every client or restarting during passive status display was rejected because it adds avoidable CPU, memory, and latency cost.
- Treating one current file as proof for a whole client or workspace was rejected because cross-file diagnostics can remain stale.
- Keeping all debug identities hidden was rejected for this development workflow because it makes local protocol failures harder to diagnose.
