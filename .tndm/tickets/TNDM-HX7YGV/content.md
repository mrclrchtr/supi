# Overview

Implement `code_impact` as the next active workflow tool in `@mrclrchtr/supi-code-intelligence`.

## Assumption

In this phase, `code_impact` becomes the preferred public workflow surface for impact analysis, while `code_affected` remains registered as a temporary compatibility alias backed by the same shared engine. This keeps the new V2 direction moving without breaking current callers in one step.

## Scope

- Activate `code_impact` on the public tool surface.
- Reuse the existing target-based impact analysis from `code_affected` for `targetId` and anchored-target requests.
- Extend the impact entry surface to support diff-aware inputs where substrate evidence is real: `changedFiles`, optional `baseRef`, and `includeTests`.
- Keep `change`-only requests honest: return an explicit unavailable/insufficient-evidence result instead of heuristic natural-language guessing.
- Update follow-up hints, docs, and tests so the preferred workflow path is clear.

## Non-goals

- Removing `code_affected` in this ticket.
- Building speculative natural-language change planning.
- Implementing `code_inspect`, `code_diagnostics`, `code_refactor`, or `code_apply` in this ticket.
- Broad repo-wide stale-doc cleanup unrelated to the `code_impact` activation.

## File structure map

- `packages/supi-code-intelligence/src/tool/execute-impact.ts` — new public executor for `code_impact`.
- `packages/supi-code-intelligence/src/tool/execute-affected.ts` — compatibility alias wrapper that reuses the shared impact implementation.
- `packages/supi-code-intelligence/src/use-case/generate-impact.ts` — shared orchestration for target-based and diff-aware impact analysis.
- `packages/supi-code-intelligence/src/use-case/generate-affected.ts` — compatibility layer or thin forwarder to the shared impact orchestration.
- `packages/supi-code-intelligence/src/presentation/markdown/impact.ts` — preferred markdown renderer and next-step hints for workflow-oriented impact results.
- `packages/supi-code-intelligence/src/presentation/markdown/affected.ts` — compatibility renderer or thin wrapper so `code_affected` stays stable while the preferred wording shifts to `code_impact`.
- `packages/supi-code-intelligence/src/tool/tool-specs.ts` — register `code_impact`, keep `code_affected`, and update prompt guidance.
- `packages/supi-code-intelligence/src/analysis/routing/planner.ts` — route `code_impact` consistently with semantic impact analysis.
- `packages/supi-code-intelligence/src/intent/types.ts` — include `code_impact` in the active public tool-name union.
- `packages/supi-code-intelligence/src/types.ts` — add or rename structured details metadata so `code_impact` has a first-class result contract without breaking `code_affected` callers.
- `packages/supi-code-intelligence/src/tool/target-id-params.ts` — document and support `targetId` expansion for `code_impact`.
- `packages/supi-code-intelligence/src/workflow/schemas.ts` — activate the existing `code_impact` schema contract as the public surface.
- `packages/supi-code-intelligence/src/workflow/surface.ts` — move `code_impact` from roadmap-only metadata to active workflow status notes.
- `packages/supi-code-intelligence/src/presentation/markdown/resolve.ts` — update follow-up suggestions to prefer `code_impact` where appropriate.
- `packages/supi-code-intelligence/__tests__/unit/code-impact-tool.test.ts` — dedicated unit coverage for the new public tool.
- `packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts` — assert `code_impact` registration and compatibility expectations.
- `packages/supi-code-intelligence/__tests__/unit/planner-routing.test.ts` — assert planner behavior for `code_impact`.
- `packages/supi-code-intelligence/__tests__/unit/code-resolve-tool.test.ts` — assert `targetId` follow-up and preferred hints.
- `packages/supi-code-intelligence/__tests__/unit/details-metadata.test.ts` — assert structured details and next-query metadata for impact results.
- `packages/supi-code-intelligence/README.md` — document `code_impact` as active/preferred and explain `code_affected` compatibility status.
- `packages/supi-code-intelligence/CLAUDE.md` — keep maintainer guidance aligned with the active surface.
- `docs/tool-architecture.md` — update shared tool-surface docs for the new preferred workflow tool.

## Implementation approach

1. Write failing tests that define the `code_impact` contract, routing, schema shape, and compatibility expectations.
2. Activate `code_impact` as a registered public tool and factor the current impact logic behind a shared executor/use-case path.
3. Add diff-aware impact inputs only where there is real evidence (`changedFiles`, `baseRef`, `includeTests`), and keep `change`-only requests explicitly unavailable.
4. Update markdown hints and docs so the user/model-facing guidance consistently prefers `code_impact` while acknowledging the temporary `code_affected` alias.

## Verification strategy

- Use targeted RED/GREEN Vitest runs while developing.
- Before closing, run full package verification:
  - `RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/ --reporter=verbose`
  - `RTK_DISABLED=1 pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json packages/supi-code-intelligence/__tests__/tsconfig.json`
  - `RTK_DISABLED=1 pnpm exec biome check packages/supi-code-intelligence`
- Manual smoke at the end: resolve a symbol with `code_resolve`, run `code_impact` with the returned `targetId`, and confirm `code_affected` still works as the compatibility path.
