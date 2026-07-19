# Workspace LSP runtime interface

**Status:** Accepted (2026-07-13)

## Context

Peer modules previously reached a session registry that exposed a mutable LSP manager wrapper. Routing, readiness, semantic requests, diagnostics, recovery, and lifecycle were split across forwarding modules, so callers needed implementation knowledge and tests mostly verified delegation.

## Decision

Separate lifecycle from workspace operations with two interfaces:

- `LspRuntimeController` owns start, shutdown, settings, detected-server inventory, and published status.
- `WorkspaceLspRuntime` owns workspace operations: routing, readiness, semantic requests, tracked files, diagnostics, and recovery.

A ready controller publishes `{ kind: "ready", runtime }`. Pending, inactive, disabled, and unavailable states remain explicit in the workspace registry. When the effective configuration contains no enabled language-server definitions, the controller publishes `disabled` and does not register semantic capability. A ready runtime may still have no proactively started clients because configured routes can start lazily; consumers must not infer semantic evidence from runtime presence alone.

Runtime readiness requires a concrete live client: workspace readiness requires at least one active ready client, and file readiness succeeds only when routing starts or finds the client for that file. A zero-client workspace or a routed `null` client is unavailable, not vacuously ready. When workspace warm-up finds no live client, the runtime owner remains published and semantic capability remains pending so a later file-scoped request may start a lazy route; the controller does not promote or retract it merely because workspace warm-up was empty.

Server-inventory evidence and semantic availability are separate facts. A live runtime owner or explicit disabled state establishes complete inventory status; pending, inactive, and unavailable states do not establish an empty inventory. Health may report a known disabled state and empty server inventory as complete runtime-status evidence, but that status carries no semantic provenance. Workspace diagnostics claim semantic availability only when at least one project server is active and ready; a file-scoped check may first establish readiness for that file. Requested diagnostic recovery runs before the final availability decision and availability is recomputed afterward.

`WorkspaceLspRuntime` is exported as an interface. `DefaultWorkspaceLspRuntime` and `LspManager` remain package-internal. Callers cannot obtain clients or the manager through the public seam.

The private `DefaultWorkspaceLspRuntime` is the single operational implementation. It
normalizes paths, coordinates readiness and semantic requests, and composes the
package-internal manager's client, diagnostic, and recovery mechanics. The manager and
clients remain implementation details rather than additional runtime seams.

## Consequences

- Code-intelligence workflows depend on one coherent operational interface rather than manager methods.
- Lifecycle/status policy stays separate from workspace query policy.
- Internal implementation changes do not expand the public seam.
- Runtime tests assert observable operations and state publication; forwarding-only tests are removed.
- The runtime owns the cross-cutting ordering and policy that consumers rely on, including path normalization, readiness timeouts, pull-state invalidation, and owner-controlled shutdown.
- `supi-code-runtime` still brokers semantic and structural capability state. It does not absorb LSP lifecycle or diagnostics.

## Rejected alternatives

- **Export `LspManager`:** leaks clients and mutable implementation state.
- **Put lifecycle on `WorkspaceLspRuntime`:** combines two change patterns and lowers interface depth.
- **Keep a bag of forwarding functions:** gives little leverage and forces callers to understand routing.
- **Move the runtime into `supi-code-intelligence`:** loses semantic-runtime reuse and package locality.
