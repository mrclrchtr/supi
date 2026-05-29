# Task 8: Update CLAUDE.md documentation for code_graph

## Goal
Update CLAUDE.md to document `code_graph` and remove documentation for the old three tools.

## Files
- `packages/supi-code-intelligence/CLAUDE.md`

## Changes
1. In the "Surfaces" section: update tool list to include `code_graph`, remove old three
2. In "Architecture" tree: add `execute-graph.ts`, remove old executors
3. Replace the three separate "Public tool contracts" sections (`code_references`, `code_calls`, `code_implementations`) with a single `code_graph` section:
   ```
   ### `code_graph`
   Unified relation graph. Replaces code_references, code_calls, code_implementations.

   - targetId (preferred) or file+line+character or symbol
   - relations: ["references", "callees", "imports", "exports", "implements", "tests"]
   - Default relations: ["references"]
   - Each relation dispatched to appropriate substrate (semantic for references/implements, structural for callees)
   - Best-effort: unavailable providers skip with note rather than failing
   - direction, depth, maxNodes accepted but reserved for future use
   ```
4. Update "Public-surface split" section: remove references to old tools
5. Update "Param validation" section: document code_graph validation rules

## Verification
- Read through CLAUDE.md to confirm no stale references to code_references, code_calls, code_implementations as public tools
- Any internal references to the old service modules (analysis/references/service.ts etc.) should remain

