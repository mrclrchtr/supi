## 1. Public LSP library surface

- [x] 1.1 Add `packages/supi-lsp/index.ts` as the documented public root entrypoint.
- [x] 1.2 Define and export the public session-service types from the package root (service state, service wrapper, and related reusable result types).
- [x] 1.3 Add or update focused tests that verify `@mrclrchtr/supi-lsp` can be imported from the package root without reaching into private files.

## 2. Shared session-scoped LSP service registry

- [x] 2.1 Create an internal registry module for shared session-scoped LSP service state keyed by session `cwd`.
- [x] 2.2 Wire `packages/supi-lsp/lsp.ts` `session_start` flow to publish `pending`, `ready`, `disabled`, or `unavailable` service state into the registry.
- [x] 2.3 Wire `session_shutdown` and related lifecycle cleanup to clear or invalidate the published service state.
- [x] 2.4 Add tests covering service acquisition after startup, before readiness, and while LSP is disabled.

## 3. Reusable LSP service wrapper and implementation support

- [x] 3.1 Add `textDocument/implementation` capability typing to the LSP protocol types.
- [x] 3.2 Implement implementation-provider requests in `packages/supi-lsp/client.ts` with clear unsupported handling when a server does not advertise the capability.
- [x] 3.3 Add manager/service-layer helpers that expose reusable semantic operations through the public `SessionLspService` wrapper without leaking raw `LspManager` internals.
- [x] 3.4 Add tests covering implementation-provider success and unsupported-provider behavior through the reusable service surface.

## 4. Standalone `lsp` tool validation and path resolution

- [x] 4.1 Add explicit action-specific validation helpers for `hover`, `definition`, `references`, `diagnostics`, `symbols`, `rename`, `code_actions`, `workspace_symbol`, `search`, and `symbol_hover`.
- [x] 4.2 Replace exception-driven parameter handling in `packages/supi-lsp/tool-actions.ts` with clear validation-error responses.
- [x] 4.3 Refactor standalone `lsp` tool file handling so relative `file` inputs resolve from the session `cwd` instead of ambient process state.
- [x] 4.4 Add tests covering missing parameters, empty query/symbol values, relative-path resolution, and missing-file behavior.

## 5. Standalone-safe tree-sitter guidance

- [x] 5.1 Rewrite `packages/supi-tree-sitter/tree-sitter.ts` prompt guidance so it describes structural analysis directly and does not require a sibling `lsp` tool by name.
- [x] 5.2 Add or update tests that verify standalone `tree_sitter` guidance remains correct when `supi-tree-sitter` is used independently.

## 6. Documentation and verification

- [x] 6.1 Update `packages/supi-lsp/README.md` to document the current action surface, remove stale `PI_LSP_*` env-var guidance, and describe the new public library surface.
- [x] 6.2 Update `packages/supi-lsp/resources/supi-lsp-guide/SKILL.md` to match the current settings model and tool/action contract.
- [x] 6.3 Update `packages/supi-tree-sitter/README.md` and any related package docs to describe standalone-safe positioning relative to future semantic tooling.
- [x] 6.4 Update root or meta-package docs that still describe stale LSP configuration or outdated package roles.
- [x] 6.5 Update `packages/supi-lsp/CLAUDE.md` and `packages/supi-tree-sitter/CLAUDE.md` so package-specific gotchas and maintenance guidance match the new public API, validation behavior, and standalone positioning.
- [x] 6.6 Run targeted verification (`vitest`, package-scoped typecheck, and Biome) for `packages/supi-lsp/` and `packages/supi-tree-sitter/`.
