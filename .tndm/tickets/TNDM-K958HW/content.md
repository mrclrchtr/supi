## Overview
Refactor `packages/supi-code-intelligence` target resolution into an explicit targeting pipeline without changing public `code_*` tool contracts or package boundaries.

This is a single coherent subsystem change, so it should stay in one plan.

## Approach
Keep behavior stable at the tool surface, but separate the current mixed responsibilities into explicit phases:

1. normalize the incoming action query
2. resolve anchored targets
3. resolve file-surface target groups
4. resolve symbol-discovery targets
5. map typed outcomes to existing action-facing strings/details at the edge

The resolver core should return typed facts (`resolved`, `group`, `disambiguation`, `error`) instead of mixing routing, formatting, and substrate acquisition in one place.

## File map
### New files
- `packages/supi-code-intelligence/src/targeting/types.ts` — normalized query types, resolver dependencies, typed outcomes
- `packages/supi-code-intelligence/src/targeting/query.ts` — convert `CodeQueryParams`-like inputs into anchored/file/symbol target queries
- `packages/supi-code-intelligence/src/targeting/resolve-anchored.ts` — anchored file+position resolution
- `packages/supi-code-intelligence/src/targeting/resolve-file.ts` — file-level target-group resolution using injected semantic/structural substrates
- `packages/supi-code-intelligence/src/targeting/resolve-symbol.ts` — semantic symbol discovery and disambiguation candidates
- `packages/supi-code-intelligence/__tests__/unit/targeting-query.test.ts` — focused tests for query normalization and routing

### Modified files
- `packages/supi-code-intelligence/src/target-resolution.ts` — thin compatibility facade or orchestration entry over the new modules
- `packages/supi-code-intelligence/src/resolve-target.ts` — simplify action-facing target resolution and keep formatting at the edge
- `packages/supi-code-intelligence/src/actions/brief-action.ts` — consume typed symbol-resolution outcomes without duplicating policy
- `packages/supi-code-intelligence/src/actions/callers-action.ts` — preserve existing tool output while consuming the simplified resolver
- `packages/supi-code-intelligence/src/actions/callees-action.ts` — same as above
- `packages/supi-code-intelligence/src/actions/implementations-action.ts` — same as above
- `packages/supi-code-intelligence/src/actions/affected-action.ts` — same as above
- `packages/supi-code-intelligence/__tests__/unit/target-resolution.test.ts` — move existing coverage to the new module boundaries and preserve legacy expectations
- `packages/supi-code-intelligence/__tests__/unit/tool-adapters.test.ts` — keep action-level behavior coverage for error and file-level cases

## Invariants to preserve
- anchored requests still require `file`, `line`, and `character`
- `path` still scopes but does not anchor a position
- symbol discovery stays semantic-only
- file-level exploration may combine LSP document symbols with Tree-sitter exports
- non-search tools do not fall back to grep/text search
- ambiguous symbol matches still return explicit disambiguation instead of guessing

## Implementation notes
- Prefer dependency injection from action/tool entrypoints over hidden deep `createSemanticSubstrate()` / `createStructuralSubstrate()` calls.
- If reducing churn requires `src/target-resolution.ts` to remain the import surface for existing tests/callers, keep it as a stable facade while moving logic behind it.
- Keep markdown/disambiguation formatting outside the core resolution modules unless a tiny shared formatter clearly reduces duplication.
- Add JSDoc to new exported targeting types and non-obvious policy helpers.

## Verification strategy
Use TDD for the new targeting modules:
- write/adjust focused unit tests first for query normalization and typed outcomes
- confirm they fail for the right reason
- implement the minimal pipeline changes to pass
- then refactor call sites while keeping action-level behavior tests green

Fresh final verification:
- `pnpm exec vitest run packages/supi-code-intelligence/__tests__/unit/targeting-query.test.ts packages/supi-code-intelligence/__tests__/unit/target-resolution.test.ts packages/supi-code-intelligence/__tests__/unit/tool-adapters.test.ts`
- `pnpm exec biome check packages/supi-code-intelligence`
- `pnpm exec tsc --noEmit -p packages/supi-code-intelligence/tsconfig.json`
- `pnpm exec tsc --noEmit -p packages/supi-code-intelligence/__tests__/tsconfig.json`

## Non-goals
- no `code_*` schema or output-contract redesign
- no `supi-lsp` / `supi-tree-sitter` ownership changes
- no broader markdown rendering refactor beyond what this cleanup directly needs