# Task 4: Move pattern search logic onto explicit use-case and markdown modules

## Goal
Finish the layered refactor by splitting `code_pattern` into typed search orchestration plus dedicated renderers for literal, regex, structured, summary, and empty/error states.

## Files
Create:
- `packages/supi-code-intelligence/src/use-case/generate-pattern.ts`
- `packages/supi-code-intelligence/src/presentation/markdown/pattern.ts`

Modify:
- `packages/supi-code-intelligence/src/tool/execute-pattern.ts`
- `packages/supi-code-intelligence/src/pattern-structured.ts` only if shared structured-match types need to be imported cleanly by the use-case
- `packages/supi-code-intelligence/__tests__/unit/pattern-summary.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/pattern-duplicates.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/pattern-structured-search.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/tool-adapters.test.ts`

Delete after migration:
- `packages/supi-code-intelligence/src/actions/pattern-action.ts`

## Change
1. Write/update failing tests first for literal search, opt-in regex, malformed regex errors, structured search, and summary mode.
2. Implement a typed pattern use-case that handles validation outcomes, literal vs regex ripgrep flow, structured search flow, empty-state branching, and metadata inputs without composing markdown.
3. Move all pattern text formatting into `src/presentation/markdown/pattern.ts`.
4. Update `executePatternTool()` to remain a thin adapter that validates params, builds the structural substrate when needed, runs the use-case, renders markdown, and returns `CodeIntelResult`.
5. Delete `src/actions/pattern-action.ts` after imports are migrated.

## Verification
RED/GREEN focused checks during the task:
- `RTK_DISABLED=1 pnpm -v exec vitest run packages/supi-code-intelligence/__tests__/unit/pattern-summary.test.ts packages/supi-code-intelligence/__tests__/unit/pattern-duplicates.test.ts packages/supi-code-intelligence/__tests__/unit/pattern-structured-search.test.ts packages/supi-code-intelligence/__tests__/unit/tool-adapters.test.ts`

Type/style checks for touched files:
- `RTK_DISABLED=1 pnpm -v exec biome check packages/supi-code-intelligence/src/tool/execute-pattern.ts packages/supi-code-intelligence/src/use-case packages/supi-code-intelligence/src/presentation/markdown packages/supi-code-intelligence/__tests__/unit/pattern-summary.test.ts packages/supi-code-intelligence/__tests__/unit/pattern-duplicates.test.ts packages/supi-code-intelligence/__tests__/unit/pattern-structured-search.test.ts packages/supi-code-intelligence/__tests__/unit/tool-adapters.test.ts`
- `RTK_DISABLED=1 pnpm -v exec tsc --noEmit -p packages/supi-code-intelligence/tsconfig.json`

