## Why

Project/root detection in `supi-lsp` includes useful LSP-agnostic filesystem utilities for walking projects, finding root markers, deduplicating roots, and resolving known roots. `supi-code-intelligence` will need the same primitives to build architecture models, and future extensions may need them too. Leaving the utilities inside `supi-lsp` would force peer extensions to duplicate logic or import from `supi-lsp` internals.

## What Changes

- Move reusable project/root detection helpers from `supi-lsp` into `supi-core`
- Export the shared utilities from `@mrclrchtr/supi-core`
- Update `supi-lsp` to import the utilities from `supi-core` without behavior changes
- Preserve existing scanning, root-deduplication, and known-root resolution semantics
- Add or move tests so both the shared utility behavior and `supi-lsp` integration remain covered

## Capabilities

### New Capabilities
- `project-root-utilities`: Shared `supi-core` utilities for project walking, root marker detection, path containment, root sorting, and known-root resolution

### Modified Capabilities
- `lsp-proactive-scan`: `supi-lsp` consumes the shared `supi-core` utilities instead of defining local copies, with no semantic behavior change

## Impact

- **Modified package**: `supi-core` gains new exported project/root utility functions
- **Modified package**: `supi-lsp` imports project/root helpers from `supi-core` and removes local duplicates
- **Tests**: utility tests move or expand around `supi-core`, and existing `supi-lsp` scanner/root tests continue to pass
- **Downstream unblock**: `supi-code-intelligence` can build architecture-model scanning without duplicating filesystem logic or reaching into `supi-lsp` internals
