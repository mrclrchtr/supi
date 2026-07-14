# supi-lsp

Language Server Protocol integration for PI. Provides semantic code-intelligence capabilities consumed by `supi-code-intelligence`.

See also: `packages/supi-code-intelligence/CONTEXT.md` and `packages/supi-code-runtime/CONTEXT.md`.

## Language

**Workspace LSP runtime**:
The workspace-scoped interface that owns file routing, semantic readiness and operations, tracked files, diagnostics, and recovery. It hides clients and the mutable manager, giving callers a deep operational seam with high locality inside `supi-lsp`.
_Avoid_: LspManager, LSP singleton, provider bag, client registry

**LSP runtime controller**:
The lifecycle/status module for one workspace. It starts and shuts down language-server infrastructure, publishes runtime state, and reports detected project servers. It does not own semantic workflow policy.
_Avoid_: Workspace LSP runtime, semantic provider, query router

**Runtime state**:
The explicit registry state for a workspace: ready, pending, inactive, disabled, or unavailable. Ready and inactive states may carry a Workspace LSP runtime; callers must not infer readiness from runtime presence alone.
_Avoid_: nullable runtime, implicit startup, manager availability
