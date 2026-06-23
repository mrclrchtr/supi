# Phase 6: Fix Existing Tool Rough Edges

## Goal
Fix four trust issues in the current 9 public code intelligence tools before building new ones. Each fix is independently reviewable and testable.

## Non-Goals
- No new tools (code_verify, code_failure_analyze, code_review_diff)
- No architectural changes (no EvidenceCollector, no new abstractions)
- No cross-session persistence for target handles
- No new refactor operations beyond rename

## Decisions from Brainstorming

### 1. `code_impact` test detection — boundary regex + companions fallback
- Replace `findLikelyTests` naive substring (`file.includes("test")`) with boundary-aware regex matching:
  - `/\.test\./` or `/\.spec\./` in filename
  - `/\/__tests__\//` in path
  - Word-boundary checks to avoid false positives on words like "contest" or "manifest"
- Keep `findTestCompanions` as fallback for affected files that don't match the regex
- Report provenance: "detected via name heuristic" vs "detected as companion file"

### 2. `code_context` stubbed sections — wire real data
- **`tests` section:**
  - Use existing `findTestCompanions` logic for the target file
  - Additionally scan reference files for companion tests
  - When provider available, use structural outline to find test-like declarations (describe/it blocks, functions named `test*`)
- **`diagnostics` section:**
  - Reuse `gatherNearbyDiagnostics` from `code_inspect` for the target file
  - Extend to pull diagnostics from reference files (files that reference the target symbol), capped at 5 files
  - When no LSP available, return explicit unavailable note
- **`docs` section:**
  - Use tree-sitter outline + source text extraction to pull JSDoc/TSDoc comments for the target symbol
  - When no structural provider available, return explicit unavailable note

### 3. `code_graph` schema cleanup — remove unimplemented params
- Remove `direction`, `depth`, and `maxNodes` from `CodeGraphParameters` schema in `workflow/schemas.ts`
- Remove corresponding fields from `CodeGraphToolParams` interface in `tool/execute-graph.ts`
- Update tool spec description and prompt guidelines in `tool/tool-specs.ts`
- Update all test files that reference these params

### 4. `code_context` no-target guidance — explicit resolve instructions
- When `task` is present but no `targetId`/`file`/`symbol` is provided, return:
  - Clear message: "No target provided for task-focused context."
  - Actionable next step: "Use `code_resolve` with a `query` matching this task to get a `targetId`, then retry `code_context` with that `targetId`."
  - Do NOT attempt to infer targets from the task string

## Files to Change
- `packages/supi-code-intelligence/src/use-case/generate-impact.ts` — `findLikelyTests`
- `packages/supi-code-intelligence/src/use-case/generate-context.ts` — `buildRequestedSection` for tests/docs/diagnostics
- `packages/supi-code-intelligence/src/use-case/gather-context.ts` — helpers for diagnostics/docs extraction
- `packages/supi-code-intelligence/src/workflow/schemas.ts` — remove direction/depth/maxNodes
- `packages/supi-code-intelligence/src/tool/execute-graph.ts` — remove direction/depth/maxNodes params
- `packages/supi-code-intelligence/src/tool/tool-specs.ts` — update descriptions
- `packages/supi-code-intelligence/__tests__/unit/code-impact-tool.test.ts` — boundary regex tests
- `packages/supi-code-intelligence/__tests__/unit/code-context-tool.test.ts` — real tests/diagnostics sections
- `packages/supi-code-intelligence/__tests__/unit/tool/execute-graph.test.ts` — schema cleanup

## Testing Plan
- New test cases for `findLikelyTests` with boundary regex (true positives + false negatives)
- New test cases for `findTestCompanions` fallback
- New test cases for `code_context` with tests/diagnostics sections against mock providers
- Verify no tests reference removed schema fields
- Full package test run: `pnpm vitest run packages/supi-code-intelligence/`

## Verification
- Run `pnpm test:ai` after all changes
- Run `pnpm typecheck:ai` after schema changes
- Run `pnpm biome:ai` for linting
