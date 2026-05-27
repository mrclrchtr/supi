# Merge code_map into code_brief

Enrich directory-scoped `code_brief` output with factual inventory (extension breakdown, total file count, landmark files). Remove `code_map` from the public tool surface entirely.

## Approach
Extend `brief-focused.ts`'s `RecursiveDirectorySummary` with extension counts, total file count, and landmark detection during the existing recursive walk. Delete the standalone `code_map` tool executor, renderer, and analysis service. Drop `MapDetails` type. Convert `map-action.test.ts` to verify enrichment in directory brief output.

## Changes

### Source
1. **`brief-focused.ts`** — extend `RecursiveDirectorySummary` with `byExtension`, `totalFiles`, `landmarkFiles`. Populate during walk. Render extension breakdown and landmarks in `formatNonModuleDir`.
2. **`intent/types.ts`** — remove `"code_map"` from `CODE_INTELLIGENCE_TOOL_NAMES`
3. **`tool/tool-specs.ts`** — remove `code_map` spec entry, drop `executeMapTool` import
4. **`tool/guidance.ts`** — remove `code_map` entry from `INTENT_GUIDELINES`
5. **`types.ts`** — remove `MapDetails` (keep other types)
6. **`api.ts`** / **`index.ts`** — remove `MapDetails` re-export

### Deletions
7. **`tool/execute-map.ts`** — delete
8. **`presentation/markdown/map.ts`** — delete (render extension breakdown in brief renderer)
9. **`analysis/map/service.ts`** — delete (already dead code)

### Tests
10. **`map-action.test.ts`** — rewrite to call `executeBriefTool` with directory path, assert extension breakdown and landmarks in output
11. **`details-metadata.test.ts`** — remove `MapDetails` assertions

### Docs
12. **`CLAUDE.md`** — update tool list, remove code_map descriptions
13. **`README.md`** — update tool list, remove code_map descriptions

## Non-goals
- No changes to `code_brief` parameter surface
- No changes to anchored/symbol/project brief modes
- No new provider calls

## Verification
- Typecheck passes
- All tests pass
- `code_map` not found in tool specs, types, or guidance
- Directory brief includes extension breakdown, total file count, landmarks
- Biome clean (existing-style issues accepted)