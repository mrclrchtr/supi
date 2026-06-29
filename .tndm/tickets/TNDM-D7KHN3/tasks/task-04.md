# Task 4: Update docs for enriched code_brief

## Goal
Update CLAUDE.md and README.md to reflect enriched brief output and maxResults behavior.

## Files
- `packages/supi-code-intelligence/CLAUDE.md` — update `code_brief` contract section: mention outline, imports, exports, diagnostics enrichment; document maxResults default caps
- `packages/supi-code-intelligence/README.md` — update tool overview for code_brief: mention enriched file/module output

## Change
- CLAUDE.md public tool contracts section: add enrichment description under code_brief
- README tool overview: mention "includes structural context and diagnostics when available"

## Verification
- Manual review: both files describe enriched output accurately
- No stale references to old behavior
