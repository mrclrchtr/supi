# Task 4: Add code_graph to tool specs, remove old three specs

## Goal
Add `code_graph` to the tool spec registry and remove the old three tool specs.

## Files
- `packages/supi-code-intelligence/src/tool/tool-specs.ts`

## Changes
1. Add import for `executeGraphTool` from `"./execute-graph.ts"`
2. Use `CodeGraphParameters` (already imported from `"../workflow/schemas.ts"`)
3. Add a new `code_graph` entry to `CODE_INTELLIGENCE_TOOL_SPECS` with:
   - name: `"code_graph"`
   - label: `"Code Graph"`
   - description: explains relation-family dispatch, targetId-first workflow
   - promptSnippet: `"code_graph — semantic and structural relation graph"`
   - basePromptGuidelines: usage instructions (prefer targetId, default is references, use relations for multi-family queries)
   - parameters: `CodeGraphParameters` (extended with file/line/character/symbol/path/maxResults)
   - run: `executeGraphTool`
4. Remove old `code_references`, `code_calls`, `code_implementations` entries
5. Remove old executor imports (`executeReferencesTool`, `executeCallsTool`, `executeImplementationsTool`)

## Note on CodeGraphParameters extensions
The existing `CodeGraphParameters` in `workflow/schemas.ts` only has targetId/relations/direction/depth/maxNodes. Extend it in `tool-specs.ts` (or extend the workflow schema) to also include file/line/character/symbol/path/maxResults for backward compatibility with raw-coordinate workflows.

## Verification
- `pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json`
- Guidance auto-generates from specs — run `pnpm vitest run packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts` after test updates
