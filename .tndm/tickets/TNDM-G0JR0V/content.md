# Implementation Plan Overview

## Scope check
The approved design spans two separable efforts:

1. **Behavioral architecture redesign** — move semantic/structural/search/refactor routing behind a shared planner and broker.
2. **Package/install-surface redesign** — rename/re-split packages toward a `supi-code*` family.

This plan covers **(1)** only. It keeps the existing package boundaries (`packages/supi-code-runtime`, `packages/supi-lsp`, `packages/supi-tree-sitter`, `packages/supi-code-intelligence`) and now also optimizes for **minimal public-surface churn**:
- keep `code_brief`
- keep `code_relations`
- keep `code_affected`
- keep `code_pattern`
- add `code_refactor`

Package renames/new install surfaces remain intentionally deferred to a follow-up ticket after the runtime/tool behavior is stable.

## Assumptions
- The repo remains pre-release, so internal refactors and the addition of `code_refactor` are acceptable.
- Existing `lsp_*` and `tree_sitter_*` tools remain available as expert/debug surfaces.
- `code_refactor` may apply changes directly only when semantic edits are precise and unambiguous; otherwise it must stop with an explicit unavailable/disambiguation result.
- Existing architecture/model, targeting, and search helpers should be reused where they still fit, rather than rewritten for its own sake.

## Target outcome
Deliver:
- a shared capability broker in `supi-code-runtime`
- richer provider contracts from `supi-lsp` and `supi-tree-sitter`
- an intent/planning layer in `supi-code-intelligence` that routes existing read-only `code_*` tools through one planner
- a new `code_refactor` tool for direct-apply semantic refactors guarded by explicit safety checks

## Concrete refactor contract
Define refactoring as an **optional semantic capability**, not a third independent broker family.

Add a shared provider contract equivalent to:
- `rename(file, position, newName) -> RefactorResult`
- `codeActions(file, position) -> RefactorResult[]` or a provider-specific equivalent that can be normalized into `RefactorResult`

Shared result/value types must make the safety rules executable in tests:
- `RefactorConfidence` / equivalent result discriminator with states matching the plan rules (`precise`, `ambiguous`, `unavailable`)
- `WorkspaceEdit` as canonical precise edits
- file-level edit/value types needed to apply `WorkspaceEdit` deterministically
- a safety-validation path that can reject empty, ambiguous, or out-of-bounds edits before apply

## File structure map

### Shared runtime contracts and broker
- `packages/supi-code-runtime/src/capability/types.ts` — extend provider contracts to cover richer capability metadata and optional semantic refactor support
- `packages/supi-code-runtime/src/types.ts` — add canonical shared refactor/edit/value types needed by the planner and direct-apply flow
- `packages/supi-code-runtime/src/workspace/runtime.ts` — evolve the workspace registry into the single broker for semantic and structural capability state, with semantic metadata indicating refactor readiness
- `packages/supi-code-runtime/src/workspace/context.ts` — expose broker-backed workspace access helpers to consumers
- `packages/supi-code-runtime/src/api.ts` — publish the new broker and shared types
- `packages/supi-code-runtime/__tests__/unit/workspace-runtime.test.ts` — update existing runtime coverage
- `packages/supi-code-runtime/__tests__/unit/capability-broker.test.ts` — add broker-specific state/transition tests

### LSP substrate
- `packages/supi-lsp/src/provider/lsp-semantic-provider.ts` — adapt semantic facts and optional refactor operations into the broker contract
- `packages/supi-lsp/src/session/runtime-registration.ts` — register semantic capability state, including whether precise refactors are available
- `packages/supi-lsp/src/session/service-registry.ts` and `packages/supi-lsp/src/api.ts` — expose the data needed by the refactor path without leaking manager internals
- `packages/supi-lsp/__tests__/unit/semantic-provider.test.ts`
- `packages/supi-lsp/__tests__/unit/runtime-registration.test.ts`
- `packages/supi-lsp/__tests__/unit/refactor-provider.test.ts` — new precise-edit contract tests (may target `lsp-semantic-provider.ts` if a separate provider file is unnecessary)

### Tree-sitter substrate
- `packages/supi-tree-sitter/src/provider/tree-sitter-provider.ts` — adapt structural facts into the broker contract
- `packages/supi-tree-sitter/src/session/runtime-registration.ts` — register structural capability metadata with the shared broker
- `packages/supi-tree-sitter/src/api.ts` — export any missing shared service types needed by the planner
- `packages/supi-tree-sitter/__tests__/unit/provider.test.ts`
- `packages/supi-tree-sitter/__tests__/unit/runtime-registration.test.ts`

### Shared planner-backed code-intelligence layer
- `packages/supi-code-intelligence/src/code-intelligence.ts` — register the existing read-only `code_*` surface plus `code_refactor`
- `packages/supi-code-intelligence/src/tool/tool-specs.ts` — keep `code_brief`, `code_relations`, `code_affected`, and `code_pattern`; add `code_refactor`
- `packages/supi-code-intelligence/src/tool/register-tools.ts` — wire the planner-backed tool contracts
- `packages/supi-code-intelligence/src/tool/guidance.ts` — rewrite guidance around user intent while preserving the existing public read-only tool names
- `packages/supi-code-intelligence/src/tool/validation.ts` — shared validation for the planner-backed tool family
- `packages/supi-code-intelligence/src/tool/execute-refactor.ts` — thin adapter for `code_refactor`
- `packages/supi-code-intelligence/src/intent/types.ts` — normalized intent and result contracts
- `packages/supi-code-intelligence/src/planner/planner.ts` — central planning entry point with pure routing helpers for overview/resolve/relations/affected/search/refactor
- `packages/supi-code-intelligence/src/refactor/apply-workspace-edit.ts` — direct-apply file mutation path for precise edits
- `packages/supi-code-intelligence/src/refactor/safety.ts` — ambiguity/precision/bounds checks
- `packages/supi-code-intelligence/src/presentation/markdown/refactor.ts` — human-readable refactor result formatting
- Existing reusable helpers that should be adapted rather than replaced wholesale where possible:
  - `packages/supi-code-intelligence/src/model.ts`
  - `packages/supi-code-intelligence/src/resolve-target.ts`
  - `packages/supi-code-intelligence/src/targeting/query.ts`
  - `packages/supi-code-intelligence/src/targeting/resolve-anchored.ts`
  - `packages/supi-code-intelligence/src/targeting/resolve-symbol.ts`
  - `packages/supi-code-intelligence/src/targeting/resolve-file.ts`
  - `packages/supi-code-intelligence/src/search-helpers.ts`
  - `packages/supi-code-intelligence/src/use-case/generate-pattern.ts`
  - existing overview/relations/affected/pattern presentation helpers where they still fit
- Tests:
  - `packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts`
  - `packages/supi-code-intelligence/__tests__/unit/tool-adapters.test.ts`
  - `packages/supi-code-intelligence/__tests__/unit/planner-routing.test.ts` — new
  - `packages/supi-code-intelligence/__tests__/unit/refactor-tool.test.ts` — new
  - `packages/supi-code-intelligence/__tests__/unit/refactor-safety.test.ts` — new

### Documentation and compatibility sweep
- Core package docs:
  - `packages/supi-code-intelligence/README.md`
  - `packages/supi-code-intelligence/CLAUDE.md`
  - `packages/supi-lsp/README.md`
  - `packages/supi-lsp/CLAUDE.md`
  - `packages/supi-tree-sitter/README.md`
  - `packages/supi-tree-sitter/CLAUDE.md`
  - `packages/supi-code-runtime/README.md`
  - `packages/supi-code-runtime/CLAUDE.md`
- Stale-reference sweep across:
  - `packages/`
  - `scripts/`
  - `docs/`
  - `.pi/`
  - `.agents/`
- Known must-check references include:
  - `packages/supi-debug/src/status-log.ts`
  - `packages/supi-claude-md/skills/`
  - `scripts/check-supi-container-load`
  - `docs/tool-architecture.md`
  - `packages/supi-lsp/__tests__/integration/e2e-smoke.test.ts`

## Sequencing
Implement the work in vertical slices:
1. shared contracts/broker
2. LSP provider upgrade with optional refactor support
3. tree-sitter provider upgrade
4. shared planner behind the existing read-only `code_*` tools
5. direct-apply `code_refactor`
6. docs and compatibility sweep

Each slice must leave the repo green before the next begins.

## Verification strategy
- Use red-green-refactor for each testable slice.
- Start with a single `planner.ts`; extract per-intent strategy files only if the implementation grows enough to justify them.
- Route planner resolution through the existing targeting pipeline (`resolve-target.ts` and `src/targeting/*`) instead of re-implementing target resolution logic.
- Run package-scoped tests first, then typecheck and biome for touched packages.
- Treat `code_refactor` as unsafe until tests prove: unambiguous target resolution, precise edit boundaries, deterministic apply order, and explicit refusal when only heuristic matches are available.
- After the new behavior is green, sweep docs/tests/scripts/skills and remove stale references only where they are truly stale; do not rename the existing read-only `code_*` tools in this ticket.

## Deferred follow-up
Package renames/new install surfaces (`supi-code`, `supi-code-core`, `supi-code-provider-lsp`, `supi-code-provider-tree-sitter`, optional expert-tools package) are explicitly out of scope for this ticket and should be tracked separately after the behavior redesign lands.