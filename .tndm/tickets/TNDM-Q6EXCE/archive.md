# Archive

# Verification Results: TNDM-Q6EXCE

## Summary
Merge `code_map` into `code_brief` — enriched directory brief with extension breakdown, total file count, and landmark files. Removed `code_map` from public tool surface. Deleted dead files. Tool count reduced from 9 to 8.

## Per-Task Verification

### Task 1 (RED) — Rewrite tests
- `map-action.test.ts` rewritten to test directory brief enrichment via `executeBriefTool`
- All 4 tests pass (extension breakdown, landmarks, nested paths, file paths)
- `details-metadata.test.ts` updated to remove `MapDetails` assertions
- Both test files: 30 tests pass

### Task 2 (GREEN) — Remove code_map from public surface
- `intent/types.ts`: `"code_map"` removed from `CODE_INTELLIGENCE_TOOL_NAMES`
- `tool/tool-specs.ts`: code_map spec entry removed, `executeMapTool` import dropped, `CodeMapParameters` removed
- `tool/guidance.ts`: code_map entry removed from `INTENT_GUIDELINES`
- Typecheck clean

### Task 3 (GREEN) — Enrich directory brief
- `brief-focused.ts` extended with:
  - `EXTENSION_LABELS` map (human-readable extension names)
  - `LANDMARK_FILES` set (well-known project config files)
  - `SKIP_DIRS` set (node_modules, dist, build, .git)
  - `collectDirectoryInventory()` — flat walk counting all files by extension and detecting landmarks
  - `addInventoryToLines()` — renders extension breakdown and landmark files
- Wired into `formatNonModuleDir` and `addSourceFilesSection` (module briefs)
- Directory/module briefs now include extension breakdown, total file count, and landmark files

### Task 4 (GREEN) — Delete dead files
- Deleted: `src/tool/execute-map.ts`, `src/presentation/markdown/map.ts`
- Confirmed: `src/analysis/map/service.ts` already absent (dead code)
- `MapDetails` interface removed from `src/types.ts`
- `MapDetails` re-exports removed from `src/api.ts`, `src/index.ts`
- `"map"` type discriminator removed from `CodeIntelResult` union
- Typecheck clean

### Task 5 — Update docs
- `CLAUDE.md`: removed all code_map references, updated tool list, added directory/module brief enrichment docs, removed code_map from gotchas and param validation
- `README.md`: removed code_map from feature list and tool overview, added directory brief enrichment note to code_brief section

### Task 6 — Final verification
- Typecheck: no errors
- Tests: 292 passed, 4 skipped (36 files, 2.21s)
- Stale reference scan: zero matches for `code_map`, `executeMapTool`, `MapDetails` in source/docs
- Biome: 16 existing-style lint issues only (pre-existing useMaxParams for pi execute signature, cognitive complexity)
