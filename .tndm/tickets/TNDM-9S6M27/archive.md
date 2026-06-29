# Archive

# Phase 1 Final Verification — All Passed

## Active public `code_resolve`
- Registered as an active public tool alongside existing `code_*` tools
- Accepts `query`, `scope`, `kind`, `file`, `line`, `character`, `maxResults`
- Supports three input shapes: anchored (file + line + character), file-only, and query/symbol
- Returns `targetId` (`tg-*`) and `spanId` (`sp-*`) handles
- Ambiguous symbols return ranked disambiguation candidates with target IDs
- No text-search fallback for missing semantic query results

## TargetId follow-up coverage
- `code_references`, `code_calls`, `code_implementations`, `code_affected`, `code_brief`, and `code_refactor_plan` all accept optional `targetId`
- `targetId` takes precedence over raw file/line/character/symbol
- Unknown or stale target IDs return explicit unavailable errors

## Unchanged public substrate tools
- All `lsp_*` expert tools remain public and active
- All `tree_sitter_*` expert tools remain public and active
- Only `code_resolve` was added from the V2 workflow set; remaining 7 V2 tools stay unregistered

## Verification results

### Focused tests (20 pass)
- `workflow-target-store.test.ts` — 6 pass
- `code-resolve-tool.test.ts` — 14 pass (10 core + 4 targetId follow-up)

### Registration/surface tests (21 pass)
- `extension-registration.test.ts` — 14 pass
- `workflow-surface.test.ts` — 7 pass

### Full package tests (320 pass, 4 skipped)
- 37 test files passed, 2 skipped (pre-existing)
- 320 tests passed, 4 skipped (pre-existing)

### TypeScript
- `tsc -b` — no errors

### Biome
- Source and tests — clean, no errors

### Stale reference check
- No remaining "Phase 0 does not register" language in source, tests, or docs

## Recommended next phase
Phase 2: `code_context` and `code_find` — the next pair of V2 workflow tools. These would replace `code_brief` and `code_pattern` respectively. Alternatively, a bridge phase integrating targetId into the refactor pipeline for targeted follow-up use cases.
