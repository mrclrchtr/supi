# Improve code intelligence test discovery and impact accuracy

## Assumption

This plan targets the most important change from the code-intelligence tool audit: prevent `code_graph`, `code_context`, and `code_impact` from falsely reporting no tests / low confidence when relevant package tests exist but are not found through semantic references alone.

## Problem

The current test discovery path is too narrow:

- `packages/supi-code-intelligence/src/analysis/relations/tests.ts` primarily discovers tests from semantic `references()` results.
- `packages/supi-code-intelligence/src/use-case/generate-impact.ts` computes target-based affected files only from reference sites, so a symbol with zero semantic references can produce an empty affected-file set and no likely tests.
- `code_graph` and `code_context` can miss package-level tests such as `packages/supi-code-intelligence/__tests__/unit/tool/execute-graph.test.ts` for `packages/supi-code-intelligence/src/tool/execute-graph.ts`.
- `code_impact` does not surface concrete verification commands, forcing agents to infer which test command to run.

## Goals

1. Introduce one shared test-discovery helper that combines semantic import/reference evidence with deterministic file/path conventions.
2. Reuse that helper from `code_graph`, `code_context`, and `code_impact` so all three tools report tests consistently.
3. Make target-based impact analysis seed the changed target file itself, not only reference sites, so no-reference symbols still produce useful affected-file/test evidence.
4. Add likely test command suggestions to impact markdown/details when tests are found.
5. Preserve explicit unavailable/no-evidence messaging when providers are missing and no deterministic test candidates exist.

## Non-goals

- Do not add broad natural-language search or AI guessing.
- Do not scan `node_modules`, build output, coverage output, or unrelated low-signal directories.
- Do not change the public tool names or parameter schemas.
- Do not make `code_apply` or refactor behavior part of this change.

## File structure

Files to modify:

- `packages/supi-code-intelligence/src/analysis/relations/tests.ts` — centralize shared test-file discovery, deterministic naming/path fallbacks, provenance, caps, and optional test-function extraction.
- `packages/supi-code-intelligence/src/tool/execute-graph.ts` — replace direct `findTestCompanionFiles()` usage with the shared helper for the `tests` relation.
- `packages/supi-code-intelligence/src/use-case/generate-context.ts` — use the same shared helper in the `tests` section.
- `packages/supi-code-intelligence/src/use-case/generate-impact.ts` — include target files in impact seeds, reuse shared test discovery for target-based and changed-files impact, and generate likely test commands.
- `packages/supi-code-intelligence/src/presentation/markdown/affected.ts` — render likely test commands for single-target and file-level impact output.
- `packages/supi-code-intelligence/src/presentation/markdown/impact.ts` — render likely test commands for changed-files impact output.
- `packages/supi-code-intelligence/src/types.ts` — add structured detail metadata for likely test commands if the command list is returned in `details`.
- `packages/supi-code-intelligence/README.md` — document that `code_graph`/`code_context`/`code_impact` use import evidence plus deterministic test conventions, and that `code_impact` can suggest concrete test commands.
- `packages/supi-code-intelligence/CLAUDE.md` — update maintainer-facing tool contract/gotchas for the shared test discovery behavior.

Files to create or extend for tests:

- `packages/supi-code-intelligence/__tests__/unit/analysis/relations-tests.test.ts` — new focused unit tests for the shared discovery helper.
- `packages/supi-code-intelligence/__tests__/unit/tool/execute-graph.test.ts` — add regression coverage for package-layout test discovery without semantic test references.
- `packages/supi-code-intelligence/__tests__/unit/code-context-tool.test.ts` — add regression coverage for the task-context `tests` section using package-layout test discovery.
- `packages/supi-code-intelligence/__tests__/unit/code-impact-tool.test.ts` — add regression coverage for target-based impact including the target file, likely tests, and test command suggestions.
- `packages/supi-code-intelligence/__tests__/unit/presentation/relations-render.test.ts` or existing presentation tests as needed — update only if renderer contracts change.

## Acceptance criteria

- For source `packages/supi-code-intelligence/src/tool/execute-graph.ts`, test discovery can surface `packages/supi-code-intelligence/__tests__/unit/tool/execute-graph.test.ts` without requiring a semantic reference from that test file to `executeGraphTool`.
- `code_graph` with `relations: ["tests"]` reports discovered test files and test names when structural outline data is available.
- `code_context` with `include: ["tests"]` reports the same discovered tests as `code_graph` for the same target.
- `code_impact` with `includeTests: true` for a no-reference target reports the target file as affected evidence and includes likely tests instead of an empty test list.
- `code_impact` includes concrete likely test command suggestions, for example `pnpm vitest run packages/supi-code-intelligence/__tests__/unit/tool/execute-graph.test.ts --reporter=verbose`.
- Existing false-positive guards remain intact: paths like `contest.ts`, `testing.ts`, and `tool-specs.ts` are not treated as tests merely because they contain the substring `test`.
- `pnpm vitest run packages/supi-code-intelligence --reporter=verbose` and `pnpm exec tsc -b --pretty false packages/supi-code-intelligence/tsconfig.json packages/supi-code-intelligence/__tests__/tsconfig.json` pass after implementation.
