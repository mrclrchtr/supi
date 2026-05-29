# Task 3: Create execute-graph.ts unified executor

## Goal
Create the unified `code_graph` executor that resolves a target once and dispatches to the appropriate analysis service per requested relation.

## Files
- NEW: `packages/supi-code-intelligence/src/tool/execute-graph.ts`

## Design

The executor:
1. Expands `targetId` via `expandTargetId()` (same pattern as existing executors)
2. Validates params: requires `targetId` OR (`file` + `line` + `character`) OR `symbol`
3. Checks provider availability for each requested relation (best-effort)
4. Resolves the target once via `resolveTarget()`
5. For each relation in `relations` (default `["references"]`):
   - `references` → `collectReferences()` from `analysis/references/service.ts`
   - `callees` → `collectOutgoingCalls()` from `analysis/calls/service.ts`
   - `implements` → `collectServiceImplementations()` from `analysis/implementations/service.ts`
   - `imports`, `exports`, `tests` → return "not yet implemented" note
6. Renders combined output via `renderGraphResult()` from `presentation/markdown/relations.ts`
7. Returns structured `CodeIntelResult` with details

## Schema params to accept (beyond existing CodeGraphParameters)
- `targetId`: from code_resolve (preferred)
- `file`, `line`, `character`: raw coordinates (for backward compat)
- `symbol`: symbol name fallback
- `path`: scope path (for references filtering)
- `maxResults`: result cap (maps to `maxNodes` internally)

## Pattern to follow
Follow the boilerplate pattern from `execute-references.ts`:
- same `expandTargetId()` + validation flow
- same `getCodeProvider()` + `resolveTarget()` pattern
- but iterate over relations array instead of single service call

## Verification
- `pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json` compiles cleanly
- Code review: compare against `execute-references.ts` pattern for correctness

