# Task 2: Add code_graph routing in planner, remove old tool routes

## Goal
Add `code_graph` routing case to the planner's `routeFor()` function. The graph tool needs availability checks for multiple substrates depending on which relations are requested.

## Files
- `packages/supi-code-intelligence/src/analysis/routing/planner.ts`

## Changes
1. Add a `case "code_graph":` to the `routeFor()` switch
2. The graph route needs both semantic and structural providers available. Return:
   - `"semantic"` if semantic is available (covers references + implements, the most common case)
   - `"structural"` if only structural is available (covers callees case)
   - `"unavailable"` if neither is available
3. Remove the old `code_references`, `code_calls`, `code_implementations` cases

## Verification
- `pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json` compiles cleanly
- `pnpm vitest run packages/supi-code-intelligence/__tests__/unit/planner-routing.test.ts` — will fail until tests are updated in task 8

