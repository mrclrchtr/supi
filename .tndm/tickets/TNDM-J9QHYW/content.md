# Redesign code intelligence relations and refactor ergonomics

## Scope check

This plan covers one coherent code-intelligence public-surface change: relation semantics and semantic refactor safety. It intentionally does not include the larger greenfield redesign from the architecture review. The work spans tool registration, analysis services, renderers, tests, and docs, but all changes are needed for one testable result.

## Approved design summary

Replace the overloaded and misleading relation/refactor surface with focused high-level tools:

- `code_references` — semantic usages of an anchored or symbol target via LSP.
- `code_calls` — structural outgoing calls from the enclosing function or method via tree-sitter.
- `code_implementations` — semantic implementation lookup via LSP.
- `code_refactor_plan` — preview-only semantic rename planning.
- `code_refactor_apply` — explicit application of a previously generated, still-valid refactor plan.

Clean break is allowed for `code_*` contracts. Stop registering `code_relations` and `code_refactor`. Keep `lsp_*` and `tree_sitter_*` expert tools available, but update guidance to route the model toward the corrected high-level `code_*` tools first.

`code_calls` v1 means outgoing calls only. Do not claim true incoming callers. Semantic tools must not fall back to heuristic search.

## File structure map

### Public tool metadata and registration

- `packages/supi-code-intelligence/src/intent/types.ts` — update canonical code-intelligence tool names and remove relation-kind public types.
- `packages/supi-code-intelligence/src/tool/tool-specs.ts` — replace `code_relations`/`code_refactor` specs with `code_references`, `code_calls`, `code_implementations`, `code_refactor_plan`, and `code_refactor_apply` specs.
- `packages/supi-code-intelligence/src/tool/guidance.ts` — update intent-first prompt guidance for references, calls, implementations, and two-step refactors.
- `packages/supi-code-intelligence/src/tool/register-tools.ts` — pass enough `ExtensionContext` data to executors so refactor apply can inspect session branch state.
- `packages/supi-code-intelligence/src/tool/families/code/*.ts` — keep family re-export surfaces aligned with the new code tool names.
- `packages/supi-code-intelligence/src/analysis/routing/planner.ts` and `packages/supi-code-intelligence/src/planner/planner.ts` — replace relation-kind routing with per-tool capability routing.

### References, calls, and implementations

- `packages/supi-code-intelligence/src/tool/execute-references.ts` — tool edge for `code_references`.
- `packages/supi-code-intelligence/src/tool/execute-calls.ts` — tool edge for `code_calls`.
- `packages/supi-code-intelligence/src/tool/execute-implementations.ts` — tool edge for `code_implementations`.
- `packages/supi-code-intelligence/src/analysis/references/service.ts` — semantic reference collection over resolved targets.
- `packages/supi-code-intelligence/src/analysis/calls/service.ts` — structural outgoing call lookup.
- `packages/supi-code-intelligence/src/analysis/implementations/service.ts` — semantic implementation lookup.
- `packages/supi-code-intelligence/src/presentation/markdown/references.ts` — renderer that labels usages/references accurately.
- `packages/supi-code-intelligence/src/presentation/markdown/calls.ts` — renderer for outgoing calls.
- `packages/supi-code-intelligence/src/presentation/markdown/implementations.ts` — renderer for implementation locations.
- `packages/supi-code-intelligence/src/use-case/support/semantic-references.ts` — keep or adapt shared reference helpers so `code_affected` and `code_references` use the same evidence semantics.
- `packages/supi-code-intelligence/src/use-case/generate-affected.ts` — update affected analysis to share the canonical reference service.
- `packages/supi-code-intelligence/src/tool/execute-relations.ts`, `packages/supi-code-intelligence/src/use-case/generate-relations.ts`, `packages/supi-code-intelligence/src/presentation/markdown/relations.ts`, and `packages/supi-code-intelligence/src/analysis/relations/*` — remove, replace, or leave only non-public compatibility internals if tests prove they are still needed. They must not expose misleading caller semantics.

### Refactor planning and apply

- `packages/supi-code-intelligence/src/tool/execute-refactor-plan.ts` — tool edge for preview-only rename planning.
- `packages/supi-code-intelligence/src/tool/execute-refactor-apply.ts` — tool edge for applying a plan by id.
- `packages/supi-code-intelligence/src/analysis/refactor/service.ts` — split planning/apply orchestration and stop delegating back to old tool executors.
- `packages/supi-code-intelligence/src/analysis/refactor/plan-store.ts` — create plan ids, compute file fingerprints, serialize plan details, and find plans in session branch tool-result state.
- `packages/supi-code-intelligence/src/analysis/refactor/apply-workspace-edit.ts` — keep deterministic apply behavior, add queued async apply or a queue-aware wrapper.
- `packages/supi-code-intelligence/src/refactor/apply-workspace-edit.ts` — keep compatibility forwarder aligned with the canonical refactor apply module.
- `packages/supi-code-intelligence/src/analysis/refactor/safety.ts` and `packages/supi-code-intelligence/src/refactor/safety.ts` — reuse range and overlap validation for both plan and apply.
- `packages/supi-code-intelligence/src/presentation/markdown/refactor.ts` — render plan preview, apply success, stale plan, and safety-failure states.
- `packages/supi-code-intelligence/src/types.ts` — extend details metadata for reference/call/implementation/refactor plan/apply results.

### Tests

- `packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts` — public tool registration assertions.
- `packages/supi-code-intelligence/__tests__/unit/planner-routing.test.ts` — capability routing assertions.
- `packages/supi-code-intelligence/__tests__/unit/tool-adapters.test.ts` — executor/tool adapter migration coverage.
- `packages/supi-code-intelligence/__tests__/unit/details-metadata.test.ts` — structured details metadata for new tools.
- `packages/supi-code-intelligence/__tests__/unit/semantic-references.test.ts` — reference evidence semantics shared with affected analysis.
- `packages/supi-code-intelligence/__tests__/unit/callees-action.test.ts` — migrate or replace with outgoing `code_calls` assertions.
- `packages/supi-code-intelligence/__tests__/unit/refactor-tool.test.ts` — replace direct-apply expectations with plan/apply expectations.
- `packages/supi-code-intelligence/__tests__/unit/refactor-safety.test.ts` and `packages/supi-code-intelligence/__tests__/unit/apply-workspace-edit.test.ts` — preserve safety/apply coverage and add stale/fingerprint cases where appropriate.
- New focused tests may be added under `packages/supi-code-intelligence/__tests__/unit/` as `references-tool.test.ts`, `calls-tool.test.ts`, `implementations-tool.test.ts`, and `refactor-plan-apply.test.ts` if that keeps test files below Biome size limits.
- `packages/supi-code-intelligence/__tests__/integration/fallback-chain.test.ts` — update no-heuristic-fallback expectations for new tool names.

### Documentation

- `packages/supi-code-intelligence/README.md` — update user-facing tool list, shared input conventions, and result style.
- `packages/supi-code-intelligence/CLAUDE.md` — update package contracts, gotchas, planner notes, and refactor safety notes.

## Implementation constraints

- TDD by default: testable behavior starts with failing tests, then implementation.
- No heuristic fallback for `code_references`, `code_implementations`, or refactor planning.
- `code_refactor_plan` must not mutate files.
- `code_refactor_apply` must reject stale plans by comparing stored fingerprints to current file contents before applying.
- `code_refactor_apply` should apply through pi's file mutation queue where possible.
- The final state should leave guidance and docs free of misleading `callers` wording for the high-level `code_*` surface.

## Verification strategy

Use targeted tests after each implementation step, then finish with package-level checks:

```bash
RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/__tests__/unit/<focused-test>.test.ts -v
RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/__tests__/integration/fallback-chain.test.ts -v
RTK_DISABLED=1 pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json packages/supi-code-intelligence/__tests__/tsconfig.json
RTK_DISABLED=1 pnpm exec biome check packages/supi-code-intelligence
```
