## Overview
Centralize the duplicated session-scoped registry plumbing used by `packages/supi-lsp/` and `packages/supi-tree-sitter/` into a minimal shared helper in `packages/supi-core/`, without changing the public service APIs of either substrate package.

## Recommended approach
Add a narrow core helper for session-keyed state storage backed by normalized `cwd` + `globalThis` + `Symbol.for(...)`, then migrate each package-local registry module to delegate storage to that helper while keeping package-specific state unions and LSP polling semantics local.

## Scope and constraints
- Share only the registry infrastructure: normalized-cwd keying, `get` / `set` / `clear`, and symlink-safe global storage.
- Keep `SessionLspServiceState`, `SessionTreeSitterServiceState`, and `waitForSessionLspService(...)` package-local.
- Do not introduce a generic async state framework in this pass.
- Preserve the current public behavior and imports for `@mrclrchtr/supi-lsp/api` and `@mrclrchtr/supi-tree-sitter/api`.

## File map
- `packages/supi-core/src/registry-utils.ts` — add the shared session-state registry helper alongside the existing generic registry utility.
- `packages/supi-core/src/api.ts` — export the new helper from the public core API surface.
- `packages/supi-core/src/index.ts` — mirror the API export surface.
- `packages/supi-core/__tests__/unit/registry-utils.test.ts` — add focused tests for normalized-cwd keying and shared global registry behavior.
- `packages/supi-lsp/src/session/service-registry.ts` — replace local registry boilerplate with the shared core helper while preserving LSP-specific state and wait logic.
- `packages/supi-lsp/__tests__/unit/service-registry.test.ts` — keep the current registry behavior covered after the helper migration.
- `packages/supi-tree-sitter/src/session/service-registry.ts` — replace local registry boilerplate with the shared core helper while preserving the Tree-sitter-specific state wrapper.
- `packages/supi-tree-sitter/__tests__/service-registry.test.ts` — keep the current registry behavior covered after the helper migration.
- `docs/tool-architecture.md` — document the shared session-registry pattern as the preferred follow-up to session-scoped substrate services.
- `packages/supi-core/CLAUDE.md` — note the new registry utility responsibility in the package architecture notes.
- `packages/supi-lsp/CLAUDE.md` — update maintainer notes to mention that the session registry now delegates to shared core infrastructure.
- `packages/supi-tree-sitter/CLAUDE.md` — update maintainer notes to mention that the session registry now delegates to shared core infrastructure.

## Verification strategy
Use targeted unit tests first, then package-scoped typecheck and lint verification for `supi-core`, `supi-lsp`, and `supi-tree-sitter`. Keep the verification focused on preserving session-registry behavior rather than broad workspace churn.
