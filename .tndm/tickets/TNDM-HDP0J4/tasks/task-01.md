# Task 1: Update CodeIntelligenceToolName enum: add code_graph, remove old three

## Goal
Add `"code_graph"` to `CodeIntelligenceToolName` in `intent/types.ts` and remove `"code_references"`, `"code_calls"`, `"code_implementations"`.

## Files
- `packages/supi-code-intelligence/src/intent/types.ts`

## Changes
1. In `CODE_INTELLIGENCE_TOOL_NAMES` array:
   - Add `"code_graph"` (insert alphabetically after `"code_find"`)
   - Remove `"code_references"`
   - Remove `"code_calls"`
   - Remove `"code_implementations"`
2. Keep `CodeRelationsKind` type — it's used internally by analysis/relations layer
3. Reorder remaining names to keep alphabetical

## Verification
- `pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json` shows type errors only where the old names were used (planner, tool-specs, tests) — these will be fixed in subsequent tasks
- No test-only verification needed for this task alone
