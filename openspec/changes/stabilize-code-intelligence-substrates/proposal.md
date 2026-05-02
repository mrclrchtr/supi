## Why

SuPi now has the right layered direction — `supi-lsp` for semantic analysis, `supi-tree-sitter` for structural analysis, and a future `supi-code-intelligence` package above both — but the two substrate packages are uneven. `supi-tree-sitter` already behaves like a reusable library plus standalone extension, while `supi-lsp` still behaves mostly like an extension product, making the lower layer harder to compose cleanly and less consistent as a standalone install.

## What Changes

- Expose a documented, session-scoped public service API from `@mrclrchtr/supi-lsp` so peer extensions can reuse the active LSP runtime without importing private files or starting duplicate server lifecycles.
- Extend the reusable LSP client/service layer with `textDocument/implementation` support while keeping the current standalone `lsp` tool surface unchanged.
- Tighten `lsp` tool behavior so action-specific validation errors and file-path resolution are explicit and consistent with session `cwd` semantics instead of relying on thrown exceptions or ambient process state.
- Make `supi-tree-sitter` prompt guidance standalone-safe so the package does not imply that a separate `lsp` tool is installed when it is used by itself.
- Refresh README and package-surface documentation for both packages so the published contracts match the implemented behavior and clearly describe the substrate-vs-product layering ahead of `supi-code-intelligence`.

## Capabilities

### New Capabilities
- *(none)*

### Modified Capabilities
- `lsp-client`: add a public reusable service-acquisition contract for peer extensions and add semantic implementation-provider support to the shared client/runtime layer.
- `lsp-tool`: require explicit action-specific validation and session-cwd-relative file resolution for the standalone `lsp` tool.
- `tree-sitter-tool`: require standalone-safe prompt guidance that does not assume the `lsp` tool is installed alongside `supi-tree-sitter`.

## Impact

- **Affected packages**: `packages/supi-lsp/`, `packages/supi-tree-sitter/`, and package wrappers/docs that describe or re-export them.
- **Public API**: `@mrclrchtr/supi-lsp` gains a documented importable library surface in addition to its extension entrypoint.
- **Future work unblocked**: `supi-code-intelligence` can depend on both substrate packages directly without reaching into `supi-lsp` internals or duplicating LSP server startup.
- **Documentation**: README/package docs for both substrate packages need contract cleanup so standalone installs and future composition are accurately described.
