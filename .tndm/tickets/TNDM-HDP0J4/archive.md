# Archive

## Verification Results — TNDM-HDP0J4

### Fresh verification (2026-05-28)

| Check | Result |
|---|---|
| **TypeScript** (supi-code-intelligence src + tests) | No errors |
| **Biome** (lint + format) | Clean — 143 files, no fixes applied |
| **Tests** | 385 passed, 4 skipped, 0 failures (41/43 test files) |
| **Stale executor refs in src/** | None found |
| **Stale tool name refs in src/** | None found (only metadata in workflow/surface.ts) |
| **TypeScript** (supi-debug) | No errors |

### Files changed

- **Deleted**: `execute-references.ts`, `execute-calls.ts`, `execute-implementations.ts`
- **Added**: `execute-graph.ts`, `execute-graph.test.ts`
- **Modified**: `intent/types.ts`, `planner.ts`, `tool-specs.ts`, `relations.ts`, `target-id-params.ts`, `resolve.ts`, `brief.ts`, `affected.ts`, `brief-focused.ts`, `analysis/resolve/service.ts`, `use-case/generate-brief.ts`, `use-case/generate-affected.ts`, `CLAUDE.md`, `README.md`, `status-log.ts` (supi-debug), + 10 test files
- **Total**: 31 files, +863/-798

### Post-review fixes applied

- #1: Updated all user-facing output strings from `code_references`/`code_calls` to `code_graph` (8 files)
- #2: Updated README.md (removed old tools, added code_graph, updated roadmap)
- #3: Removed dead `_structuralOnly` from planner.ts
- #4: Fixed duplicate test in planner-routing.test.ts
- #5: Confidence derivation now reflects actual substrate (structural vs semantic)
- #6: Updated supi-debug EXPECTED_SUPI_TOOLS to current 8-tool surface
- #7: Removed dead underscore-prefixed param schemas from tool-specs.ts
- #8: Restored precise test assertion in fallback-chain.test.ts
