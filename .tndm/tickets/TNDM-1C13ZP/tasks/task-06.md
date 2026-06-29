# Task 6: Docs and metadata: sync tool-specs, schemas, README, CLAUDE.md

## Goal
Sync all public contract surfaces after the behavioral changes: tool metadata, schemas, prompt guidelines, README, and CLAUDE.md.

## Files
- `packages/supi-code-intelligence/src/tool/tool-specs.ts`
- `packages/supi-code-intelligence/src/tool/guidance.ts`
- `packages/supi-code-intelligence/src/workflow/schemas.ts`
- `packages/supi-code-intelligence/README.md`
- `packages/supi-code-intelligence/CLAUDE.md`

## Changes

### `tool-specs.ts`
- `code_impact` description: append "changedFiles-based analysis uses structural evidence only. Use a resolved target for semantic reference-based impact."
- `code_graph` description: append "Each relation annotates its evidence source. Unavailable providers produce explicit notes rather than silent degradation."

### `guidance.ts`
- Add to `code_impact.basePromptGuidelines`: "Check per-relation evidence annotations in `code_graph` — results may carry conventions-only labels."
- Add to `code_graph.basePromptGuidelines`: "The tests relation displays provenance (`semantic+conventions` or `conventions-only`)."

### `schemas.ts`
- `CodeImpactParameters.includeTests` description: append "Test discovery provenance is annotated in output — conventions-only when LSP/TS is absent."
- `CodeGraphParameters.relations` description: append "The tests relation annotates whether semantic or convention-only evidence backed the results."

### `README.md`
- `code_graph` section: mention per-relation evidence annotation and tests provenance.
- `code_impact` section: note that changedFiles is structural-only; add evidence-strictness note.
- Add a short "Evidence strictness" paragraph in the Result style section explaining that every tool output declares its evidence source.

### `CLAUDE.md`
- In Public tool contracts → `code_graph`: add note: "The tests relation documents its provenance. conventions-only means no LSP/TS contributed."
- In Public tool contracts → `code_impact`: add note: "changedFiles impact is structural-only and always annotated as such."
- Add to Key gotchas: "When test discovery is conventions-only, the output explicitly says so. Zero test files + conventions-only is an unavailable result, not a silent empty list."

## Verification
- `pnpm exec biome check packages/supi-code-intelligence --max-diagnostics=20` — no issues in doc files
- Manual review: README and CLAUDE.md accurately describe the new behavior
- Manual review: no stale fallback/heuristic claims remain in any doc
