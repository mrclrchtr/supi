# Code runtime architecture

`@mrclrchtr/supi-code-runtime` is the shared capability and canonical-type module for SuPi's code-understanding stack. It does not register model-callable tools and does not own LSP or Tree-sitter lifecycle.

## Responsibilities

The package owns:

- canonical semantic and structural provider contracts
- workspace capability state and registration
- shared source, symbol, refactor, confidence, and evidence types
- workspace lookup through `getDefaultWorkspaceRuntime()`

A workspace entry records semantic and structural capability state separately. Providers remain behind the runtime broker; public code-intelligence workflow outcomes do not expose them.

## Package seams

- `supi-code-intelligence` owns the Workspace code-intelligence session, workflow policy, Tool result assembly, and the eight public `code_*` tools.
- `supi-lsp` owns `LspRuntimeController` and `WorkspaceLspRuntime` for semantic lifecycle, routing, readiness, diagnostics, and recovery.
- `supi-tree-sitter` owns the structural parser runtime.
- `supi-code-runtime` connects these packages through stable capability contracts without absorbing their lifecycle policy.

## Why this module remains separate

Canonical types and capability state are reused by semantic and structural packages. Keeping them in a small library module improves locality and prevents either substrate from depending on the public tool package. The module stays shallow in behavior but high in leverage: one type and registration interface aligns the stack.

See ADR 0015 for the Workspace code-intelligence session and Tool result assembly, ADR 0016 for the Workspace LSP runtime, and ADR 0017 for the public tool/evidence contract.
