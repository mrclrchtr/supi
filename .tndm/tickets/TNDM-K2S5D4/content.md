# Overview

## Problem
`packages/supi-code-intelligence` still has a trust gap on its tests surface. The same source target can produce different test-discovery results across `code_graph`, `code_context`, and `code_impact`, and current provenance wording mixes together file-discovery evidence and test-label extraction details. Recent fixes made the tools more honest, but the remaining behavior is still inconsistent enough to confuse users.

## Goal
Make the test-related behavior of `code_graph`, `code_context`, and `code_impact` share one internal contract so they agree on:

- which companion test files were found for the same source target
- what discovery evidence produced those files
- what empty/unavailable reason applies when nothing is shown
- how extracted test labels are represented when available

The tools may still differ in presentation, truncation, and section layout, but not in discovery semantics.

## Non-goals
This change does not:

- add a new public tool
- redesign unrelated reference, graph, or impact behavior
- make changed-files impact semantic; `changedFiles` remains structural-only
- guarantee framework-aware or language-perfect test-label extraction
- change tool names or core input parameters

## Recommended approach
Introduce one shared internal test-analysis service in `packages/supi-code-intelligence/src/analysis/relations/` and route all three public surfaces through it.

The shared service should:

1. discover candidate companion test files
2. report discovery provenance as a file-discovery-only signal
3. extract test labels with a separate extraction status/result model
4. return a normalized empty/unavailable reason
5. expose one result shape that all three tools can consume without re-implementing decision logic

## Public behavior contract

### Discovery provenance
Discovery provenance describes only how test files were found.

Allowed meanings:
- `semantic+conventions` — semantic references contributed to the discovered file set; conventions may also have contributed
- `conventions-only` — only deterministic path/layout conventions contributed to the discovered file set
- explicit unavailable/empty states when the tool cannot perform discovery or no files are found

Discovery provenance must not imply anything about whether test labels were extracted.

### Extraction status
Test-label extraction is represented separately from discovery provenance.

Expected states:
- recognized labels extracted
- no recognized test labels in the discovered file
- extraction unavailable for the current file/language/provider state

The user-facing output should prefer explicit placeholders such as `_(no recognized test blocks)_` over helper-variable or outline-symbol noise.

### Cross-tool consistency
For the same source target and provider state:
- `code_graph` tests relation and `code_context` tests section must agree on the discovered test files
- `code_impact` target-based likely-tests output must use the same discovery contract for file selection
- `changedFiles` impact may remain weaker because it is structural-only, but its likely-tests output must still be produced through the shared contract with `conventions-only` evidence

## File map

### Shared analysis
- `packages/supi-code-intelligence/src/analysis/relations/tests.ts`
  - Either evolve this file into the canonical shared test-analysis service or keep it as the public façade that delegates to a nearby helper module.
  - Own the normalized result types, discovery orchestration, extraction status, support-file exclusion rules, and conservative fallback behavior.

### Tool consumers
- `packages/supi-code-intelligence/src/tool/execute-graph.ts`
  - Consume the shared result for the `tests` relation and render discovery provenance plus extraction status accurately.
- `packages/supi-code-intelligence/src/use-case/generate-context.ts`
  - Consume the same shared result for the `tests` section so it cannot drift from `code_graph`.
- `packages/supi-code-intelligence/src/use-case/generate-impact.ts`
  - Use the shared service for likely-tests collection in both target-based and `changedFiles` paths; keep `changedFiles` structural-only.

### Rendering and docs
- `packages/supi-code-intelligence/src/presentation/markdown/impact.ts`
  - Keep likely-tests headings aligned with the normalized provenance model.
- `packages/supi-code-intelligence/src/workflow/schemas.ts`
  - Update only if details metadata or descriptions need evidence-language clarification.
- `packages/supi-code-intelligence/src/tool/tool-specs.ts`
  - Keep tool descriptions and prompt guidance aligned with the new provenance contract if wording changes are needed.
- `packages/supi-code-intelligence/README.md`
- `packages/supi-code-intelligence/CLAUDE.md`
  - Document that provenance refers to discovery evidence only and that extraction status is separate.

### Tests
- `packages/supi-code-intelligence/__tests__/unit/analysis/relations-tests.test.ts`
  - Canonical shared-service regression coverage.
- `packages/supi-code-intelligence/__tests__/unit/tool/execute-graph.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/code-context-tool.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/code-impact-tool.test.ts`
  - Cross-tool behavior and rendering regressions.

## Extraction strategy
This ticket includes broader language-agnostic best-effort label extraction, but correctness is more important than recall.

Rules:
- prefer structural/provider-backed extraction when available
- allow conservative best-effort extraction when it can recognize obvious test declarations without surfacing helper names as labels
- when confidence is low, return no labels and an explicit placeholder instead of guessing
- keep support files under `__tests__/helpers/` and `__tests__/fixtures/` excluded from runnable-test output

## Required edge cases
Implementation and tests must cover:
- semantic provider present, structural provider present
- semantic provider absent, conventions still succeed
- semantic references empty, conventions succeed
- non-mirror naming where semantic discovery finds the companion test file
- discovered test file contains only helper symbols and no recognized test labels
- discovered test file contains recognizable test labels
- changed-files impact remains structural-only but still uses the shared result contract

## Verification standard
The finished change is complete only when:
- targeted regression tests for the shared service and all three tools pass
- the package typecheck stays green
- `pnpm verify:ai` passes at the repo root
- a live smoke check in the current repo shows `code_graph` and `code_context` returning the same discovered test file for the same resolved target
