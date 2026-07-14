# Workspace code-intelligence session seam

**Status:** Superseded by ADR 0015.

This ADR introduced an internal `WorkspaceCodeIntelligenceSession` as the workspace-scoped seam for public `code_*` workflows. Tool executors receive the session explicitly, while it owns target handles, refactor plans, readiness policy, and ephemeral workflow state. LSP and Tree-sitter lifecycles remain outside the session and attach their runtime interfaces through application wiring.

The original proposal left result rendering in executors and planned an all-tools migration. ADR 0015 completes that migration: workflows now return typed immutable outcomes, Tool result assembly is canonical, and markdown/TUI are adapters over assembled facts. ADR 0017 records the final eight-tool public family and exact-one input shapes.
