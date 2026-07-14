# Workspace LSP runtime interface

**Status:** Accepted (2026-07-13)

## Context

Peer modules previously reached a session registry that exposed a mutable LSP manager wrapper. Routing, readiness, semantic requests, diagnostics, recovery, and lifecycle were split across forwarding modules, so callers needed implementation knowledge and tests mostly verified delegation.

## Decision

Separate lifecycle from workspace operations with two interfaces:

- `LspRuntimeController` owns start, shutdown, settings, detected-server inventory, and published status.
- `WorkspaceLspRuntime` owns workspace operations: routing, readiness, semantic requests, tracked files, diagnostics, and recovery.

A ready controller publishes `{ kind: "ready", runtime }`. Pending, inactive, disabled, and unavailable states remain explicit in the workspace registry.

`WorkspaceLspRuntime` is exported as an interface. `DefaultWorkspaceLspRuntime` and `LspManager` remain package-internal. Callers cannot obtain clients or the manager through the public seam.

The runtime implementation delegates focused ownership to internal interfaces:

- `ClientPool` owns tracked-file and client-lifecycle operations.
- `WorkspaceRouter` owns file support and project-server inventory.
- `DiagnosticStore` owns synchronized diagnostic reads.
- `RecoveryCoordinator` owns stale-diagnostic assessment and recovery.

These interfaces add depth by hiding routing and synchronization choices while keeping locality inside `supi-lsp`.

## Consequences

- Code-intelligence workflows depend on one coherent operational interface rather than manager methods.
- Lifecycle/status policy stays separate from workspace query policy.
- Internal implementation changes do not expand the public seam.
- Runtime tests assert observable operations and state publication; forwarding-only tests are removed.
- `supi-code-runtime` still brokers semantic and structural capability state. It does not absorb LSP lifecycle or diagnostics.

## Rejected alternatives

- **Export `LspManager`:** leaks clients and mutable implementation state.
- **Put lifecycle on `WorkspaceLspRuntime`:** combines two change patterns and lowers interface depth.
- **Keep a bag of forwarding functions:** gives little leverage and forces callers to understand routing.
- **Move the runtime into `supi-code-intelligence`:** loses semantic-runtime reuse and package locality.
