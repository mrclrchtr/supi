# Task 4: Introduce a shared planner behind the existing read-only code_* tools

## Goal
Refactor `supi-code-intelligence` so the existing read-only `code_*` tools route through one shared planner and broker-backed capability model, while keeping the current public tool names:
- `code_brief`
- `code_relations`
- `code_affected`
- `code_pattern`

## Files
- Modify `packages/supi-code-intelligence/src/code-intelligence.ts`
- Modify `packages/supi-code-intelligence/src/tool/tool-specs.ts`
- Modify `packages/supi-code-intelligence/src/tool/register-tools.ts`
- Modify `packages/supi-code-intelligence/src/tool/guidance.ts`
- Modify `packages/supi-code-intelligence/src/tool/validation.ts`
- Add `packages/supi-code-intelligence/src/intent/types.ts`
- Add `packages/supi-code-intelligence/src/planner/planner.ts`
- Reuse/adapt existing helpers where they fit instead of duplicating logic:
  - `packages/supi-code-intelligence/src/model.ts`
  - `packages/supi-code-intelligence/src/resolve-target.ts`
  - `packages/supi-code-intelligence/src/targeting/query.ts`
  - `packages/supi-code-intelligence/src/targeting/resolve-anchored.ts`
  - `packages/supi-code-intelligence/src/targeting/resolve-symbol.ts`
  - `packages/supi-code-intelligence/src/targeting/resolve-file.ts`
  - `packages/supi-code-intelligence/src/search-helpers.ts`
  - `packages/supi-code-intelligence/src/use-case/generate-pattern.ts`
  - existing presentation renderers for brief/relations/affected/pattern where they still fit
- Modify tests:
  - `packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts`
  - `packages/supi-code-intelligence/__tests__/unit/tool-adapters.test.ts`
- Add tests:
  - `packages/supi-code-intelligence/__tests__/unit/planner-routing.test.ts`

## Change
Follow TDD.

### RED
1. Add failing registration/adapter tests proving the package still exposes these default public tools:
   - `code_brief`
   - `code_relations`
   - `code_affected`
   - `code_pattern`
2. Add failing planner tests in `packages/supi-code-intelligence/__tests__/unit/planner-routing.test.ts` for the routing rules:
   - `code_brief` uses the planner for both overview and anchored/symbol resolution, delegating target resolution through the existing `resolve-target.ts` / `src/targeting/*` pipeline
   - `code_relations` routes callers/implementations to semantic evidence and callees to structural evidence
   - `code_affected` uses semantic evidence and does not silently fall back to heuristic search
   - `code_pattern` is the only path allowed to use heuristic/text search behavior
3. Run:
   - `RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts packages/supi-code-intelligence/__tests__/unit/tool-adapters.test.ts packages/supi-code-intelligence/__tests__/unit/planner-routing.test.ts -v`
   Confirm the failures are for missing planner-backed behavior rather than unrelated regressions.

### GREEN
4. Implement a single `packages/supi-code-intelligence/src/planner/planner.ts` with pure routing helpers for the existing read-only tools.
5. Rework `packages/supi-code-intelligence/src/tool/tool-specs.ts` and `packages/supi-code-intelligence/src/tool/register-tools.ts` so the existing read-only tools call into the planner.
6. Reuse existing helpers and renderers where they still fit; do not rename the existing read-only public tools in this ticket.
7. Update `packages/supi-code-intelligence/src/tool/guidance.ts` so guidance routes by user intent first and references `lsp_*` / `tree_sitter_*` only as expert follow-up tools.

### REFACTOR
8. Extract planner helpers into additional files only if `planner.ts` grows enough that the extraction is clearly beneficial after green.
9. Delete or simplify obsolete internal-only glue only after the new tests and typecheck pass; avoid broad unrelated rewrites.

## Verification
Run all of the following:
- `RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts packages/supi-code-intelligence/__tests__/unit/tool-adapters.test.ts packages/supi-code-intelligence/__tests__/unit/planner-routing.test.ts -v`
- `pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json packages/supi-code-intelligence/__tests__/tsconfig.json`
- `pnpm exec biome check packages/supi-code-intelligence`

## Test status
Test-driven.
