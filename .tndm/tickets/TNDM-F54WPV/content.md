# Refactor overview

## Goal
Introduce a shared code-runtime layer underneath `packages/supi-lsp/`, `packages/supi-tree-sitter/`, and `packages/supi-code-intelligence/` so the code-understanding stack has one canonical workspace/session model, one shared provider contract model, and one shared type system for cross-package code-intelligence operations.

## Scope decision
Keep this as one epic with ordered phases instead of splitting it into separate tickets. The work spans multiple packages, but the packages are coupled by the same seam changes: shared runtime ownership, provider contracts, project-model extraction, and orchestration cleanup. The plan below keeps each phase independently verifiable.

## Constraints
- Preserve the three current install surfaces: `packages/supi-lsp/`, `packages/supi-tree-sitter/`, and `packages/supi-code-intelligence/`.
- Allow one new shared internal package: `packages/supi-code-runtime/`.
- Avoid a big-bang rewrite. Every phase must leave the repo in a releasable state.
- Keep `lsp_*`, `tree_sitter_*`, and `code_*` tool contracts stable during the migration.
- Keep `packages/supi-tree-sitter/` and `packages/supi-lsp/` standalone-correct when installed without `packages/supi-code-intelligence/`.

## Target architecture
### `packages/supi-code-runtime/`
Own the shared code-understanding substrate contracts and workspace state:
- canonical shared types for positions, ranges, symbols, targets, diagnostics, provider availability, and confidence
- workspace-scoped session/context primitives
- provider interfaces used by semantic and structural packages
- shared project-model building and caching

### `packages/supi-tree-sitter/`
Own only structural parsing and provider implementation:
- grammar/runtime lifecycle
- structural provider implementation
- `tree_sitter_*` tool registration and formatting

### `packages/supi-lsp/`
Own only semantic/runtime behavior:
- LSP client lifecycle and routing
- diagnostics and recovery subsystems
- semantic provider implementation
- `lsp_*` tool registration and formatting

### `packages/supi-code-intelligence/`
Own only orchestration and presentation:
- target resolution
- use-case orchestration
- prioritization and ranking
- markdown rendering
- `code_*` tool registration and cross-family guidance

## File structure map
### New package
Create `packages/supi-code-runtime/` with:
- `packages/supi-code-runtime/package.json`
- `packages/supi-code-runtime/README.md`
- `packages/supi-code-runtime/CLAUDE.md`
- `packages/supi-code-runtime/tsconfig.json`
- `packages/supi-code-runtime/__tests__/tsconfig.json`
- `packages/supi-code-runtime/src/api.ts`
- `packages/supi-code-runtime/src/index.ts`
- `packages/supi-code-runtime/src/types.ts`
- `packages/supi-code-runtime/src/provider/types.ts`
- `packages/supi-code-runtime/src/session/service-registry.ts`
- `packages/supi-code-runtime/src/session/workspace-session.ts`
- `packages/supi-code-runtime/src/session/workspace-context.ts`
- `packages/supi-code-runtime/src/project/model.ts`
- `packages/supi-code-runtime/src/project/workspace-detectors.ts`
- `packages/supi-code-runtime/__tests__/unit/`

### Tree-sitter migration targets
Modify or add:
- `packages/supi-tree-sitter/package.json`
- `packages/supi-tree-sitter/src/api.ts`
- `packages/supi-tree-sitter/src/index.ts`
- `packages/supi-tree-sitter/src/types.ts`
- `packages/supi-tree-sitter/src/tree-sitter.ts`
- `packages/supi-tree-sitter/src/session/runtime.ts`
- `packages/supi-tree-sitter/src/session/session.ts`
- `packages/supi-tree-sitter/src/session/service-registry.ts`
- `packages/supi-tree-sitter/src/provider/tree-sitter-provider.ts`
- `packages/supi-tree-sitter/__tests__/unit/`

### LSP migration targets
Modify or add:
- `packages/supi-lsp/package.json`
- `packages/supi-lsp/src/api.ts`
- `packages/supi-lsp/src/index.ts`
- `packages/supi-lsp/src/session/service-registry.ts`
- `packages/supi-lsp/src/session/lsp-state.ts`
- `packages/supi-lsp/src/handlers/session-lifecycle.ts`
- `packages/supi-lsp/src/provider/lsp-semantic-provider.ts`
- `packages/supi-lsp/src/manager/client-pool.ts`
- `packages/supi-lsp/src/manager/workspace-router.ts`
- `packages/supi-lsp/src/manager/diagnostic-store.ts`
- `packages/supi-lsp/src/manager/recovery-coordinator.ts`
- `packages/supi-lsp/src/manager/capability-index.ts`
- `packages/supi-lsp/src/manager/manager.ts`
- `packages/supi-lsp/__tests__/unit/`
- `packages/supi-lsp/__tests__/integration/`

### Code-intelligence migration targets
Modify or add:
- `packages/supi-code-intelligence/package.json`
- `packages/supi-code-intelligence/src/api.ts`
- `packages/supi-code-intelligence/src/index.ts`
- `packages/supi-code-intelligence/src/code-intelligence.ts`
- `packages/supi-code-intelligence/src/architecture.ts`
- `packages/supi-code-intelligence/src/resolve-target.ts`
- `packages/supi-code-intelligence/src/target-resolution.ts`
- `packages/supi-code-intelligence/src/targeting/`
- `packages/supi-code-intelligence/src/substrates/lsp-adapter.ts`
- `packages/supi-code-intelligence/src/substrates/tree-sitter-adapter.ts`
- `packages/supi-code-intelligence/src/tool/execute-brief.ts`
- `packages/supi-code-intelligence/src/tool/execute-map.ts`
- `packages/supi-code-intelligence/src/tool/execute-relations.ts`
- `packages/supi-code-intelligence/src/tool/execute-affected.ts`
- `packages/supi-code-intelligence/src/tool/execute-pattern.ts`
- `packages/supi-code-intelligence/src/use-case/`
- `packages/supi-code-intelligence/__tests__/unit/`

### Docs and release wiring
Modify or add:
- `docs/code-runtime-architecture.md`
- `docs/package-layout.md`
- `packages/supi-lsp/README.md`
- `packages/supi-lsp/CLAUDE.md`
- `packages/supi-tree-sitter/README.md`
- `packages/supi-tree-sitter/CLAUDE.md`
- `packages/supi-code-intelligence/README.md`
- `packages/supi-code-intelligence/CLAUDE.md`
- `release-please-config.json`
- `scripts/__tests__/pack-staged.test.mjs`

## Ordered phases
1. Write the architecture doc and scaffold `packages/supi-code-runtime/` so the new layer exists in the workspace with explicit publish/release wiring.
2. Implement canonical shared runtime contracts in `packages/supi-code-runtime/` with tests.
3. Migrate `packages/supi-tree-sitter/` to expose a structural provider through the shared runtime contracts while preserving `tree_sitter_*` behavior.
4. Split `packages/supi-lsp/src/manager/manager.ts` into smaller subsystems and expose a semantic provider through the shared runtime contracts while preserving `lsp_*` behavior.
5. Extract project-model and workspace-context ownership into `packages/supi-code-runtime/`, leaving compatibility wrappers where `packages/supi-code-intelligence/` still imports legacy file paths.
6. Refactor `packages/supi-code-intelligence/` to consume the shared workspace context/providers instead of repeatedly creating substrates and rebuilding architecture data per use-case.
7. Update package docs, architecture notes, and packaging verification so the new shape is documented and publish-safe.

## Verification strategy
- Use TDD for every new runtime/provider behavior and for every regression-sensitive migration step.
- Keep package-scoped unit and integration suites green after each phase.
- Run package-scoped TypeScript builds alongside Vitest because this repo relies on direct TypeScript execution.
- Finish with a packaging/release verification sweep so the new package and updated dependencies remain packable.

## Compatibility strategy
- Preserve public tool names and parameter contracts.
- Keep compatibility façades such as `packages/supi-code-intelligence/src/target-resolution.ts` until callers have moved to shared runtime types.
- Prefer additive migrations behind existing APIs before deleting old wiring.
- Only remove transitional layers after downstream tests and packaging checks are green.
