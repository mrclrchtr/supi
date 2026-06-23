# Overview

Implement a clean point-inspection split for `@mrclrchtr/supi-code-intelligence` by adding a new public `code_inspect` tool and narrowing `code_brief` to orientation-only behavior.

Approved contract decisions:
- Add public `code_inspect` with schema `{ file, line, character, maxResults? }`.
- Remove `line` and `character` from the public `code_brief` schema.
- Keep `targetId` on `code_brief`, but make it orientation-only instead of expanding into anchored inspection.
- Keep `symbol` on `code_brief`, but make symbol briefs orientation-only instead of inspect-like.
- Do not add `code_diagnostics`; diagnostics summary and refresh remain on `code_health`.
- `code_inspect` must be best-effort and explicitly mark unavailable sections when semantic or structural substrates are missing.
- Breaking public-contract changes are acceptable in this pass.

# File map

## Public-surface and schema wiring
- `packages/supi-code-intelligence/src/intent/types.ts` — add `code_inspect` to canonical/public tool-name unions.
- `packages/supi-code-intelligence/src/workflow/names.ts` — add `code_inspect` to the active workflow tool-name list.
- `packages/supi-code-intelligence/src/workflow/index.ts` — re-export the new workflow schema/type entry.
- `packages/supi-code-intelligence/src/workflow/schemas.ts` — add `CodeInspectParameters`; keep `code_brief` out of point-inspection input.
- `packages/supi-code-intelligence/src/workflow/surface.ts` — add workflow metadata for `code_inspect` and document that it absorbs point-inspection behavior previously reached through anchored `code_brief`.
- `packages/supi-code-intelligence/src/tool/tool-specs.ts` — register `code_inspect`, define its prompt surface, and remove `line`/`character` from the public `code_brief` parameter schema.
- `packages/supi-code-intelligence/src/analysis/routing/planner.ts` — route `code_inspect` like other best-effort code-intelligence reads.

## Execution and rendering
- `packages/supi-code-intelligence/src/tool/execute-inspect.ts` — new executor for point inspection.
- `packages/supi-code-intelligence/src/tool/execute-brief.ts` — stop expanding `targetId` into anchored brief mode; map `targetId` to orientation-only symbol/file behavior.
- `packages/supi-code-intelligence/src/tool/target-id-params.ts` — add or adjust helper(s) so `code_brief` can look up target-handle metadata without forcing anchored expansion used by graph/impact/refactor.
- `packages/supi-code-intelligence/src/use-case/types.ts` — remove anchored brief input and add inspect-specific typed inputs/results.
- `packages/supi-code-intelligence/src/use-case/generate-brief.ts` — remove anchored brief execution and make symbol resolution feed orientation-only brief output.
- `packages/supi-code-intelligence/src/use-case/generate-inspect.ts` — new inspect orchestration that gathers node, enclosing symbol, hover, definition, nearby diagnostics, code action titles, and next-step hints.
- `packages/supi-code-intelligence/src/use-case/gather-context.ts` — reuse or extend the existing point-context gathering helpers for `code_inspect`.
- `packages/supi-code-intelligence/src/presentation/markdown/inspect.ts` — new renderer for inspect output and explicit unavailable sections.
- `packages/supi-code-intelligence/src/presentation/markdown/brief.ts` — remove anchored-brief rendering from the public brief path and keep symbol/file briefs orientation-focused.
- `packages/supi-code-intelligence/src/types.ts` — add `InspectDetails` and extend `CodeIntelResult.details` with `{ type: "inspect" }`.
- `packages/supi-code-intelligence/src/index.ts` — export `InspectDetails` if `types.ts` exports it publicly.
- `packages/supi-code-intelligence/src/api.ts` — export `InspectDetails` alongside the other package-level detail types.

## Follow-up guidance and docs
- `packages/supi-code-intelligence/src/presentation/markdown/resolve.ts` — add `code_inspect` follow-up suggestions using file/line/character coordinates.
- `packages/supi-code-intelligence/src/presentation/markdown/relations.ts` — replace anchored `code_brief` inspect guidance with `code_inspect` guidance.
- `packages/supi-code-intelligence/src/presentation/markdown/calls.ts` — replace anchored `code_brief` inspect guidance with `code_inspect` guidance.
- `packages/supi-code-intelligence/src/presentation/markdown/affected.ts` — replace anchored `code_brief` inspect guidance with `code_inspect` guidance while leaving orientation-only `code_brief` suggestions intact.
- `packages/supi-code-intelligence/src/use-case/generate-impact.ts` — update next-query strings to send point facts to `code_inspect` and broad orientation to `code_brief`.
- `packages/supi-code-intelligence/src/analysis/targeting/resolve-target.ts` — update anchored-coordinate guidance so it no longer implies anchored `code_brief` is the point-inspection path.
- `packages/supi-code-intelligence/README.md` — document `code_inspect`, remove anchored-brief contract text, and describe `code_brief` as orientation-only.
- `packages/supi-code-intelligence/CLAUDE.md` — update architecture notes, public contracts, and gotchas to reflect the new split.

## Test surface
- `packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts` — assert `code_inspect` is registered and anchored `code_brief` params are gone.
- `packages/supi-code-intelligence/__tests__/unit/planner-routing.test.ts` — assert `code_inspect` routing behavior.
- `packages/supi-code-intelligence/__tests__/unit/code-inspect-tool.test.ts` — new tool-level behavior tests.
- `packages/supi-code-intelligence/__tests__/unit/presentation/inspect.test.ts` — new renderer tests replacing anchored-brief renderer coverage.
- `packages/supi-code-intelligence/__tests__/unit/presentation/anchored-brief.test.ts` — remove after its assertions are migrated to `inspect.test.ts`.
- `packages/supi-code-intelligence/__tests__/unit/details-metadata.test.ts` — add inspect details coverage and remove anchored-brief expectations from `code_brief`.
- `packages/supi-code-intelligence/__tests__/unit/review-fixes.test.ts` — update symbol-brief expectations so symbol input stays orientation-only.
- `packages/supi-code-intelligence/__tests__/unit/code-impact-tool.test.ts` — update follow-up hint expectations when point-specific guidance moves to `code_inspect`.
- `packages/supi-code-intelligence/__tests__/unit/presentation/relations-render.test.ts` — update follow-up hint expectations.
- `packages/supi-code-intelligence/__tests__/helpers/execute-action.ts` — add inspect support if the updated tests need the helper to exercise `code_inspect` details through the legacy test shim.

# Behavioral requirements

## `code_inspect`
- Requires `file`, `line`, and `character`.
- Returns best-effort sections for syntax node/ancestry, enclosing symbol, hover/type info, definition target(s), nearby diagnostics, code action titles, and next recommended code tools.
- Never fills missing provider data with heuristic guesses.
- When only one substrate is available, return the available sections and mark the rest unavailable.
- When no relevant provider data is available, return an explicit unavailable result that points to `code_health` for provider status.

## `code_brief`
- Remains public.
- Accepts project/package/file/symbol orientation inputs.
- Keeps `targetId`, but uses it for orientation-only follow-up.
- Keeps `symbol`, but symbol briefs must no longer expose inspect-style node/hover/definition/code-action sections.
- No longer accepts public `line` or `character` input.

# Edge cases
- Inspecting whitespace or punctuation should still produce the concrete syntax node if available and the nearest enclosing symbol when available.
- Nearby diagnostics in `code_inspect` should stay local to the inspected file/position rather than becoming a workspace summary.
- `code_resolve -> code_brief { targetId }` must remain useful after the split.
- Orientation-only `code_brief` must not regain hidden point-inspection behavior through `targetId` or `symbol`.

# Verification strategy
- RED first for the contract split and inspect output.
- GREEN with minimal source changes that reuse existing provider/context infrastructure.
- Docs update after behavior is correct.
- Final verification must include package-scoped vitest, package + test tsconfig builds, biome, and a manual PI smoke test that proves:
  1. `code_inspect` works on a concrete symbol position,
  2. anchored `code_brief` is no longer available as a public contract,
  3. `code_resolve -> code_brief { targetId }` still returns orientation-only output.
