# Implementation Plan

## Goal
Refactor `packages/supi-code-intelligence` so `code_*` execution and hidden overview injection use an explicit use-case layer plus a markdown presentation layer, while keeping the package boundary unchanged and preserving the focused tool contracts.

## Chosen interpretation
Prefer a clean internal design. Public `code_*` tool schemas and user-facing behavior stay stable. Public package exports that already exist in `src/api.ts` / `src/index.ts` should continue to work, but they may delegate through new facade files instead of owning the implementation directly.

## Planned file structure

### New files
- `packages/supi-code-intelligence/src/use-case/types.ts` — shared typed result/input shapes used by use-cases and renderers
- `packages/supi-code-intelligence/src/use-case/build-overview.ts` — typed hidden-overview data builder from `ArchitectureModel`
- `packages/supi-code-intelligence/src/use-case/generate-brief.ts` — typed brief use-case for project/path/file/symbol/anchored flows
- `packages/supi-code-intelligence/src/use-case/generate-map.ts` — typed factual map use-case
- `packages/supi-code-intelligence/src/use-case/generate-relations.ts` — typed callers/callees/implementations use-case dispatcher
- `packages/supi-code-intelligence/src/use-case/generate-affected.ts` — typed impact-analysis use-case
- `packages/supi-code-intelligence/src/use-case/generate-pattern.ts` — typed literal/regex/structured search use-case
- `packages/supi-code-intelligence/src/use-case/support/semantic-references.ts` — shared reference aggregation helpers moved out of `src/actions/`
- `packages/supi-code-intelligence/src/presentation/markdown/overview.ts` — hidden overview renderer
- `packages/supi-code-intelligence/src/presentation/markdown/brief.ts` — brief renderer
- `packages/supi-code-intelligence/src/presentation/markdown/map.ts` — factual map renderer
- `packages/supi-code-intelligence/src/presentation/markdown/relations.ts` — callers/callees/implementations renderer
- `packages/supi-code-intelligence/src/presentation/markdown/affected.ts` — affected/impact renderer
- `packages/supi-code-intelligence/src/presentation/markdown/pattern.ts` — pattern-search renderer

### Existing files to modify
- `packages/supi-code-intelligence/src/code-intelligence.ts` — thin overview injection wiring that calls the overview use-case + renderer
- `packages/supi-code-intelligence/src/brief.ts` — public facade exporting the existing brief/overview helpers through the new layers
- `packages/supi-code-intelligence/src/api.ts`
- `packages/supi-code-intelligence/src/index.ts`
- `packages/supi-code-intelligence/src/tool/execute-brief.ts`
- `packages/supi-code-intelligence/src/tool/execute-map.ts`
- `packages/supi-code-intelligence/src/tool/execute-relations.ts`
- `packages/supi-code-intelligence/src/tool/execute-affected.ts`
- `packages/supi-code-intelligence/src/tool/execute-pattern.ts`
- `packages/supi-code-intelligence/src/tool/register-tools.ts` if adapter return plumbing needs cleanup
- `packages/supi-code-intelligence/README.md` — update source-layout notes if the internal structure changes materially
- `packages/supi-code-intelligence/CLAUDE.md` — update architecture listing and maintainer guidance

### Existing files expected to be deleted or emptied into facades
- `packages/supi-code-intelligence/src/actions/brief-action.ts`
- `packages/supi-code-intelligence/src/actions/map-action.ts`
- `packages/supi-code-intelligence/src/actions/callers-action.ts`
- `packages/supi-code-intelligence/src/actions/callees-action.ts`
- `packages/supi-code-intelligence/src/actions/implementations-action.ts`
- `packages/supi-code-intelligence/src/actions/affected-action.ts`
- `packages/supi-code-intelligence/src/actions/pattern-action.ts`
- `packages/supi-code-intelligence/src/actions/semantic-references.ts`

## Execution strategy
1. Establish shared typed use-case/presentation scaffolding and migrate overview + brief first so the public API and hidden overview path have the new shape early.
2. Migrate factual map and relations next, keeping substrate access in thin adapters and use-case orchestration out of renderers.
3. Migrate affected analysis after relations so it can reuse the moved semantic-reference helpers cleanly.
4. Migrate pattern search last because it has the most formatting variants (literal, regex, structured, summary).
5. Remove old action-layer ownership, refresh docs/tests, and run full package verification.

## Constraints to preserve
- `code_map` remains factual only.
- `code_pattern` remains the only heuristic/search-oriented tool.
- Symbol discovery remains semantic-only for non-search tools.
- Disambiguation remains explicit.
- Hidden overview remains `display: false` and deduped via `code-intelligence-overview` branch scanning.
- `CodeIntelResult.details` stays explicit and tool-specific.

## Verification strategy
Use TDD by default for each behavior-bearing step: add or update a failing focused unit test first, then implement the minimal code, then refactor while green.

Final package verification:

```bash
RTK_DISABLED=1 pnpm -v exec vitest run packages/supi-code-intelligence/
RTK_DISABLED=1 pnpm -v exec biome check packages/supi-code-intelligence
RTK_DISABLED=1 pnpm -v exec tsc --noEmit -p packages/supi-code-intelligence/tsconfig.json
RTK_DISABLED=1 pnpm -v exec tsc --noEmit -p packages/supi-code-intelligence/__tests__/tsconfig.json
```
