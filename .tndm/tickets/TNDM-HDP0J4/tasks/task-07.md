# Task 7: Update tests for code_graph, remove old tool tests

## Goal
Update all tests to reflect the new `code_graph` tool and remove references to the old three tools.

## Files

### New test file
- `packages/supi-code-intelligence/__tests__/unit/tool/execute-graph.test.ts`
  - Integration test: `code_graph({ targetId, relations: ["references"] })` works
  - Integration test: `code_graph({ file, line, character, relations: ["callees"] })` works
  - Integration test: `code_graph({ file, line, character, relations: ["references", "implements"] })` returns combined output
  - Integration test: default `relations` → `["references"]`
  - Integration test: unavailable provider → skipped with note
  - Integration test: not-implemented relations → "not yet implemented" note
  - Integration test: missing targetId and coords → validation error

### Modified test files
- `__tests__/unit/extension-registration.test.ts`
  - Remove test "registers the new high-level code tools (references, calls, implementations...)"
  - Replace with test "registers code_graph tool"
  - Update tool count expectations
  - Update "does not register inactive V2 workflow tools" to exclude code_graph from inactive list

- `__tests__/unit/planner-routing.test.ts`
  - Remove tests for code_references, code_calls, code_implementations routing
  - Add tests for code_graph routing (semantic available → semantic, structural only → structural, neither → unavailable)

- `__tests__/helpers/execute-action.ts`
  - Remove `"references"`, `"calls"`, `"implementations"` from TestAction union
  - Remove import of old executors
  - Add `"graph"` action that calls `executeGraphTool`
  - Remove old case branches

### Tests that can stay (they test internal services, not tools)
- `__tests__/unit/semantic-references.test.ts` — tests internal `collectReferences`, still valid
- `__tests__/unit/callees-action.test.ts` — rename to reflect it tests internal callee service, or remove if purely tool-level
  - Actually, this file imports `executeAction` from helpers and calls it with `action: "calls"`. Needs update to use `"graph"` action with appropriate params OR remove and replace with execute-graph.test.ts
- `__tests__/unit/analysis/relations-service.test.ts` — tests internal callers/callees/implementations modules, still valid

### Remove or significantly update
- `__tests__/unit/callees-action.test.ts` — tests old tool interface; replace with execute-graph.test.ts coverage
- `__tests__/unit/tool/families/code/execute-relations.test.ts` — tests old code_relations tool edge; rename/repurpose for code_graph validation

## Verification
- `pnpm vitest run packages/supi-code-intelligence/` — all tests pass
- `pnpm exec biome check packages/supi-code-intelligence/__tests__/` — no lint errors
