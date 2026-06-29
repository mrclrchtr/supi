# Improve code intelligence visible output correctness

## Problem

`packages/supi-code-intelligence` still has visible correctness gaps from the tool audit:

- `code_graph` and `code_context` can miss bounded package/tool-level tests such as `packages/supi-code-intelligence/__tests__/unit/code-find-tool.test.ts` for `packages/supi-code-intelligence/src/tool/execute-find.ts`.
- Reference output can repeat the same file/line, for example `L183, L183`, when semantic providers return multiple ranges on one line.
- `code_impact({ includeTests: true })` can omit test information without explaining that test discovery ran and found no bounded companion/tool tests.

## Recommended approach

Use the existing shared test discovery contract and extend only its deterministic convention pass with bounded package/tool-aware candidates.

For a source file, discovery will continue to check existing candidates:

- same-directory companions: `basename.test.ext`, `basename.spec.ext`
- same-directory `__tests__` companions
- package-level mirrors under `__tests__/unit` and `__tests__/integration`
- semantic reference/import evidence when a semantic provider is available

Add exact tool/package aliases only for bounded source shapes, especially `src/tool/execute-<name>.ts`:

- `__tests__/unit/code-<name>-tool.test.ts`
- `__tests__/integration/code-<name>-tool.test.ts`
- `__tests__/unit/<name>-tool.test.ts`
- `__tests__/integration/<name>-tool.test.ts`
- root-level package test variants such as `__tests__/unit/<basename>.test.ts` when they are exact candidates

Only existing files are accepted. There is no broad `rg`, fuzzy matching, global test index, or AI guessing.

## File map

- `packages/supi-code-intelligence/src/analysis/relations/tests.ts` — add bounded package/tool-aware candidate generation inside deterministic discovery; preserve helper/fixture exclusions and provenance.
- `packages/supi-code-intelligence/src/use-case/support/semantic-references.ts` — dedupe line numbers before compacting/rendering grouped references.
- `packages/supi-code-intelligence/src/presentation/markdown/affected.ts` — render an explicit no-likely-tests note when tests were requested and discovery returned an empty result.
- `packages/supi-code-intelligence/src/presentation/markdown/impact.ts` — preserve the changed-files evidence note and, if needed, mirror the no-likely-tests note for changed-file impact output.
- `packages/supi-code-intelligence/README.md` — document bounded package/tool-aware test discovery and explicit empty test evidence.
- `packages/supi-code-intelligence/CLAUDE.md` — update maintainer-facing gotchas for the same behavior.

## Test targets

- `packages/supi-code-intelligence/__tests__/unit/analysis/relations-tests.test.ts` — shared discovery helper regression for `src/tool/execute-find.ts` → `__tests__/unit/code-find-tool.test.ts`, with helper/fixture exclusions intact.
- `packages/supi-code-intelligence/__tests__/unit/tool/execute-graph.test.ts` — public `code_graph` regression for tool/package-aware tests and deduplicated reference lines.
- `packages/supi-code-intelligence/__tests__/unit/code-context-tool.test.ts` — public `code_context` parity regression for the same target.
- `packages/supi-code-intelligence/__tests__/unit/code-impact-tool.test.ts` — impact likely-tests regression and explicit empty-test evidence regression.

## Non-goals

- Do not change `code_find` behavior.
- Do not canonicalize `code_resolve` target IDs in this change.
- Do not change `code_refactor` / `code_apply` UX.
- Do not add a workspace-wide test index, fuzzy search, broad grep fallback, or natural-language guessing.
- Do not scan `node_modules`, build outputs, coverage outputs, helpers, or fixtures as runnable tests.

## Verification strategy

Use TDD for logic changes. Each code task starts by adding a failing test and confirming the failure. Final verification runs focused tests, package typecheck, package lint, and full workspace verification.

Expected final commands:

```bash
RTK_DISABLED=1 pnpm -s vitest run packages/supi-code-intelligence/__tests__/unit/analysis/relations-tests.test.ts packages/supi-code-intelligence/__tests__/unit/tool/execute-graph.test.ts packages/supi-code-intelligence/__tests__/unit/code-context-tool.test.ts packages/supi-code-intelligence/__tests__/unit/code-impact-tool.test.ts --reporter=verbose
RTK_DISABLED=1 pnpm exec tsc -b --pretty false packages/supi-code-intelligence/tsconfig.json packages/supi-code-intelligence/__tests__/tsconfig.json
RTK_DISABLED=1 pnpm exec biome check packages/supi-code-intelligence
RTK_DISABLED=1 pnpm verify:ai
```

## Acceptance criteria

- `code_graph` with `relations: ["tests"]` for `executeFindTool` can surface `packages/supi-code-intelligence/__tests__/unit/code-find-tool.test.ts` through conventions-only discovery when no semantic test reference contributes it.
- `code_context` with `include: ["tests"]` reports the same package/tool-level test file for the same target.
- `code_impact({ includeTests: true })` for the same target reports likely tests or explicitly says bounded test discovery found none.
- Same-line duplicate references render once in grouped reference output.
- Existing false-positive guards remain intact: helpers, fixtures, `contest.ts`, `testing.ts`, and `tool-specs.ts` are not treated as runnable tests.
- Full repo verification passes.
