# Overview

Implement the architecture redesign as an **incremental refactor of the current repo**, not as a literal greenfield rewrite. Preserve the current public expert tool families (`code_*`, `lsp_*`, `tree_sitter_*`) while restoring clean package layering and shared runtime ownership underneath them.

## Scope decision

This plan is intentionally scoped to **stack boundaries and workspace runtime ownership**.

Included in this plan:
- reintroducing a library-only shared runtime package
- moving canonical shared code-intelligence contracts out of `supi-code-intelligence`
- removing reverse package coupling from `supi-lsp` and `supi-tree-sitter` into `supi-code-intelligence`
- replacing `supi-code-intelligence`'s local provider registry/wiring with shared runtime consumption
- preserving existing public tool names and current install surfaces
- updating tests, package metadata, and maintainer docs to match the new layering

Explicitly deferred to a follow-up ticket:
- large internal breakup of `packages/supi-lsp/src/manager/manager.ts`
- large internal breakup of `packages/supi-lsp/src/client/client.ts`
- new top-level unified tools beyond the existing `code_*` family

Reason for the split: those are worthwhile changes, but they are separable from the boundary/runtime redesign and would make this plan too large to execute safely in one pass.

## Target architecture

### Layering

```text
supi-code-runtime      ← library-only shared contracts + workspace runtime
    ↑         ↑
supi-lsp   supi-tree-sitter   ← substrate packages
    ↑         ↑
    └── supi-code-intelligence ──┘   ← orchestration + architecture model + code_* UX
```

### Responsibilities

#### `packages/supi-code-runtime`
Own the shared, package-agnostic substrate contracts:
- canonical value/result types used across the code-understanding stack
- capability interfaces for semantic, structural, diagnostics, and workspace availability
- workspace-scoped capability/runtime registry
- lightweight request-context helpers for consumers

This package is library-only: no `pi.extensions`, no tool registration, no user-facing UI.

#### `packages/supi-lsp`
Remain the semantic substrate:
- continue owning LSP service lifecycle, diagnostics, recovery, UI, and `lsp_*` tools
- adapt `SessionLspService` into runtime-owned semantic/diagnostic capability contracts
- publish those capabilities into the shared workspace runtime
- stop importing `@mrclrchtr/supi-code-intelligence/api`

#### `packages/supi-tree-sitter`
Remain the structural substrate:
- continue owning Tree-sitter runtime and `tree_sitter_*` tools
- adapt `TreeSitterService` into runtime-owned structural capability contracts
- publish that capability into the shared workspace runtime
- stop importing `@mrclrchtr/supi-code-intelligence/api`

#### `packages/supi-code-intelligence`
Become a pure orchestration/UX layer:
- continue owning architecture model generation, target resolution, presentation, and `code_*` tools
- consume semantic/structural/diagnostic availability from `supi-code-runtime`
- delete the local `CodeProvider` registry/wiring layer
- stop being the canonical owner of lower-layer provider contracts

## File structure map

### New package to create

- `packages/supi-code-runtime/package.json` — library-only manifest and exports
- `packages/supi-code-runtime/README.md` — package purpose and public surface
- `packages/supi-code-runtime/CLAUDE.md` — package-specific maintainer guidance
- `packages/supi-code-runtime/tsconfig.json` — package build config
- `packages/supi-code-runtime/__tests__/tsconfig.json` — package test config
- `packages/supi-code-runtime/src/api.ts` — explicit public API surface
- `packages/supi-code-runtime/src/index.ts` — package-root re-export surface
- `packages/supi-code-runtime/src/types.ts` — canonical shared value/result types
- `packages/supi-code-runtime/src/capability/types.ts` — capability interfaces and availability states
- `packages/supi-code-runtime/src/workspace/runtime.ts` — workspace-scoped capability registry
- `packages/supi-code-runtime/src/workspace/context.ts` — helper for consumers that need a typed workspace request context
- `packages/supi-code-runtime/__tests__/unit/workspace-runtime.test.ts` — registry behavior tests
- `packages/supi-code-runtime/__tests__/unit/workspace-context.test.ts` — request-context behavior tests

### `packages/supi-lsp/`
Modify:
- `packages/supi-lsp/package.json`
- `packages/supi-lsp/README.md`
- `packages/supi-lsp/CLAUDE.md`
- `packages/supi-lsp/src/api.ts`
- `packages/supi-lsp/src/lsp.ts`
- `packages/supi-lsp/src/session/service-registry.ts`
- `packages/supi-lsp/src/provider/lsp-semantic-provider.ts`

Create:
- `packages/supi-lsp/src/session/runtime-registration.ts` — adapts `SessionLspService` into runtime-owned semantic/diagnostic capability registration
- `packages/supi-lsp/__tests__/unit/runtime-registration.test.ts`

Delete:
- `packages/supi-lsp/src/provider/lsp-code-provider.ts`

### `packages/supi-tree-sitter/`
Modify:
- `packages/supi-tree-sitter/package.json`
- `packages/supi-tree-sitter/README.md`
- `packages/supi-tree-sitter/CLAUDE.md`
- `packages/supi-tree-sitter/src/api.ts`
- `packages/supi-tree-sitter/src/tree-sitter.ts`
- `packages/supi-tree-sitter/src/session/service-registry.ts`
- `packages/supi-tree-sitter/src/provider/tree-sitter-provider.ts`

Create:
- `packages/supi-tree-sitter/src/session/runtime-registration.ts` — adapts `TreeSitterService` into runtime-owned structural capability registration
- `packages/supi-tree-sitter/__tests__/unit/runtime-registration.test.ts`

Delete:
- `packages/supi-tree-sitter/src/provider/tree-sitter-code-provider.ts`

### `packages/supi-code-intelligence/`
Modify:
- `packages/supi-code-intelligence/package.json`
- `packages/supi-code-intelligence/README.md`
- `packages/supi-code-intelligence/CLAUDE.md`
- `packages/supi-code-intelligence/src/api.ts`
- `packages/supi-code-intelligence/src/index.ts`
- `packages/supi-code-intelligence/src/code-intelligence.ts`
- `packages/supi-code-intelligence/src/targeting/resolve-file.ts`
- `packages/supi-code-intelligence/src/tool/execute-affected.ts`
- `packages/supi-code-intelligence/src/tool/execute-brief.ts`
- `packages/supi-code-intelligence/src/tool/execute-pattern.ts`
- `packages/supi-code-intelligence/src/tool/execute-relations.ts`
- `packages/supi-code-intelligence/src/use-case/generate-affected.ts`
- `packages/supi-code-intelligence/src/use-case/generate-brief.ts`
- `packages/supi-code-intelligence/src/use-case/generate-pattern.ts`
- `packages/supi-code-intelligence/src/use-case/generate-relations.ts`
- `packages/supi-code-intelligence/src/use-case/types.ts`

Create:
- `packages/supi-code-intelligence/src/workspace/request-context.ts` — single entry point for reading semantic/structural runtime state from `supi-code-runtime`
- `packages/supi-code-intelligence/__tests__/helpers/register-mock-runtime.ts`
- `packages/supi-code-intelligence/__tests__/unit/workspace/request-context.test.ts`

Delete:
- `packages/supi-code-intelligence/src/provider/code-provider.ts`
- `packages/supi-code-intelligence/src/provider/registry.ts`
- `packages/supi-code-intelligence/src/provider/wiring.ts`
- `packages/supi-code-intelligence/__tests__/helpers/register-mock-provider.ts`
- `packages/supi-code-intelligence/__tests__/unit/provider/registry.test.ts`

### Repo-level docs / release metadata
Modify:
- `docs/package-layout.md` — add `supi-code-runtime` back to the package matrix and describe its intended shape
- `release-please-config.json` — add `packages/supi-code-runtime/package.json` to `extra-files`

## Behavioral expectations

After the refactor:
- `packages/supi-lsp/src/**` and `packages/supi-tree-sitter/src/**` must not import `@mrclrchtr/supi-code-intelligence/api`
- `supi-code-intelligence` must no longer own a session-scoped provider registry
- runtime availability must distinguish missing capability from pending, inactive, and unsupported states
- `code_*` tools must still degrade explicitly instead of silently guessing when a required semantic capability is unavailable
- standalone installs for `supi-lsp` and `supi-tree-sitter` must remain valid
- `supi-code-intelligence` must still activate all three tool families through its package manifest

## Verification strategy

Each implementation task must start with a failing targeted test or, for non-code metadata/docs work, a concrete pre-change verification step.

Minimum final verification for the full plan:
- `pnpm exec biome check packages/supi-code-runtime packages/supi-lsp packages/supi-tree-sitter packages/supi-code-intelligence docs/package-layout.md release-please-config.json`
- `pnpm vitest run packages/supi-code-runtime/ packages/supi-lsp/ packages/supi-tree-sitter/ packages/supi-code-intelligence/`
- `pnpm exec tsc -b packages/supi-code-runtime/tsconfig.json packages/supi-code-runtime/__tests__/tsconfig.json packages/supi-lsp/tsconfig.json packages/supi-lsp/__tests__/tsconfig.json packages/supi-tree-sitter/tsconfig.json packages/supi-tree-sitter/__tests__/tsconfig.json packages/supi-code-intelligence/tsconfig.json packages/supi-code-intelligence/__tests__/tsconfig.json`
- `rg -n "@mrclrchtr/supi-code-intelligence/api" packages/supi-lsp packages/supi-tree-sitter` returns no source-code imports
- `pnpm pack:check` succeeds so the reintroduced package and bundled dependency metadata stage correctly

## Non-goals

This plan does not:
- rename the existing `code_*`, `lsp_*`, or `tree_sitter_*` public tool names
- introduce new user-facing top-level tools
- rewrite LSP runtime internals beyond the capability-registration boundary work needed here
- manually edit `.release-please-manifest.json`
