# Overview

## Problem
The active `code_*` workflow surface is close to the intended public model, but three gaps still make it less trustworthy than it should be:

1. `code_resolve` can register a `targetId` at a declaration anchor that is weaker than the best identifier anchor for downstream calls such as `code_graph({ relations: ["callees"] })`.
2. `code_health` publicly advertises `include` sections for `coverage` and `unused`, but the current execution/rendering path still behaves diagnostics-first and does not surface those requested sections truthfully.
3. Adjacent behavior and docs still contain stale assumptions that `lsp_*` and `tree_sitter_*` are the public tool families, which no longer matches the current code-only surface.

This ticket is a focused hardening pass on the active public surface before any new workflow tool such as `code_context` is introduced.

## Scope check
This plan stays as one ticket because all work serves one coherent outcome: make the current public `code_*` surface internally consistent, behaviorally truthful, and reflected in surrounding package behavior/docs. It intentionally excludes unrelated refactors and future-surface expansion.

## Approach
Use a narrow hardening pass with three coordinated workstreams:

- improve `code_resolve` target registration and `targetId` follow-up fidelity
- make `code_health` section selection honest, including `coverage` and `unused`
- sweep nearby behavior/docs that still model old substrate-named public tools

The implementation should prefer the smallest changes that make the existing surface trustworthy. No new public tools, no provider lifecycle changes, and no file/resource refactor support are part of this ticket.

## File map
### Target fidelity and follow-up behavior
- `packages/supi-code-intelligence/src/targeting/resolve-symbol.ts` — refine symbol-resolution output so stored targets prefer the most useful follow-up anchor available from semantic symbol data.
- `packages/supi-code-intelligence/src/analysis/resolve/service.ts` — register resolved targets with the improved anchor and preserve symbol metadata for downstream use.
- `packages/supi-code-intelligence/src/tool/target-id-params.ts` — expand `targetId` without discarding stored identity data needed by follow-up tools.
- `packages/supi-code-intelligence/src/tool/execute-graph.ts` — prefer stored target identity when rendering graph results from `targetId`-based inputs.
- `packages/supi-code-intelligence/__tests__/unit/code-resolve-tool.test.ts` — strengthen `targetId` follow-up regression coverage.
- `packages/supi-code-intelligence/__tests__/unit/workflow-target-store.test.ts` — verify stored target metadata and staleness behavior still match the new anchor strategy.

### Truthful code_health sections
- `packages/supi-code-intelligence/src/tool/execute-health.ts` — make requested `include` sections drive collection instead of falling back to diagnostics-first behavior.
- `packages/supi-code-intelligence/src/presentation/markdown/health.ts` — render only requested sections, including explicit `coverage` / `unused` output and explicit unavailable/no-report states when requested artifacts are absent.
- `packages/supi-code-intelligence/src/prioritization-signals.ts` — reuse or minimally extend existing coverage/unused loading helpers for health reporting.
- `packages/supi-code-intelligence/__tests__/unit/code-health-tool.test.ts` — lock section-gating, coverage/unused reporting, and absent-report behavior.

### Adjacent package cleanup for the code-only surface
- `packages/supi-claude-md/src/discovery.ts` — treat the active `code_*` tools with file/path inputs as path-aware discovery sources instead of relying only on `lsp_*` / `tree_sitter_*` prefixes.
- `packages/supi-claude-md/__tests__/unit/discovery.test.ts` — add discovery coverage for representative `code_*` tool inputs.
- `packages/supi-code-intelligence/src/ui/code-intelligence-status-command.ts` — show only the active code-intelligence tool family in `/ci-status` output.
- `packages/supi-code-intelligence/__tests__/unit/code-intelligence-status-command.test.ts` — verify `/ci-status` reflects the code-only public surface.
- `packages/supi-tree-sitter/README.md` — remove stale statements that imply standalone public `tree_sitter_*` activation.
- `packages/supi-tree-sitter/CLAUDE.md` — update maintainer guidance so the package is described consistently as a library-only structural substrate.
- `packages/supi-code-intelligence/README.md` — document `code_health` coverage/unused sections and keep the public-surface wording aligned with the implementation.
- `packages/supi-code-intelligence/CLAUDE.md` — update maintainer guidance for the truthful `code_health` behavior and the code-only surface.

## Behavior requirements
### 1. `targetId` fidelity
- `code_resolve` results should register a follow-up target anchor that works as well as the best practical anchored call for downstream tools.
- `targetId` expansion must continue to reject unknown or stale handles explicitly.
- When stored target metadata includes a symbol name/kind, downstream presentation should use it instead of falling back to anonymous `symbol at ...` labels.
- If semantic symbol data does not provide a stronger anchor, the tool should keep best-effort behavior without inventing precision.

### 2. `code_health` truthfulness
- When `include` is omitted, keep the current default sections.
- When `include` is provided, render only the requested sections.
- `coverage` and `unused` must be real sections, not accepted-but-ignored enum values.
- If a requested coverage or unused report is unavailable, return an explicit note for that requested section instead of silently substituting diagnostics.

### 3. Adjacent-surface consistency
- Path-aware subdirectory discovery should work from active `code_*` tool events that provide a concrete file/path input.
- `/ci-status` should describe the code-only public surface rather than listing removed substrate-named tool families.
- Library docs for `supi-tree-sitter` and maintainer docs for `supi-code-intelligence` should match the current architecture and public surface.

## Verification strategy
- Add regression tests before code changes for the two behavior fixes (`targetId` fidelity and `code_health` section truthfulness).
- Add or extend unit tests for adjacent-surface cleanup (`supi-claude-md` discovery and `/ci-status`).
- End with a package-level verification sweep across the touched packages:
  - `RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/ packages/supi-claude-md/`
  - `RTK_DISABLED=1 pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json packages/supi-code-intelligence/__tests__/tsconfig.json`
  - if `packages/supi-claude-md` test or type surfaces need a narrower command, run the corresponding package-scoped verification there as part of the final sweep.

## Non-goals
- do not add `code_context`, `code_inspect`, or any other new public tool
- do not merge more tools into a mega-tool
- do not add file/resource refactor operations; that remains separate from this ticket
- do not remove or redesign LSP / Tree-sitter lifecycle controllers
- do not broaden the work into unrelated refactors or cleanup
