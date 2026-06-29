# Overview

## Problem
The recent evidence-hardening work improved honesty for `code_find`, `code_graph`, `code_context`, and `code_impact`, but three trust-surface issues remain:

1. user-facing test listings can still show low-signal fallback names such as `tmpDir`, `writeSource`, and repeated `result`
2. `code_impact` with `changedFiles` claims structural-only/path-based evidence, but the implementation can still thread semantic references into likely-test discovery
3. public docs and follow-up guidance still contain stale or overbroad contract text (`file` vs `scope`, stale `path` / `exportedOnly` mentions, and overclaims about helper-name filtering)

## Goal
Tighten the trust surface without expanding capability:

- show only recognized test block names (`describe`, `it`, `test`, `spec`) in user-facing test listings
- when no recognized blocks are found, show the test file and `_(no recognized test blocks)_`
- make `code_impact` with `changedFiles` truly structural-only so runtime behavior matches its `**Evidence: structural**` contract exactly
- align README, CLAUDE.md, tool guidance text, and follow-up hints with the actual public contract

## Non-goals
- do not deepen `changedFiles` impact analysis beyond the current structural/file-level model
- do not redesign `code_graph` best-effort per-relation dispatch
- do not change `code_find`, `code_resolve`, `code_inspect`, `code_refactor`, `code_apply`, or `code_health` behavior beyond trust-surface wording cleanup
- do not add a debug/details surface for raw outline fallback names in this change

## File map
- `packages/supi-code-intelligence/src/analysis/relations/tests.ts` — shared test discovery and recognized-test-name extraction behavior
- `packages/supi-code-intelligence/src/tool/execute-graph.ts` — user-facing rendering for `code_graph` test relation
- `packages/supi-code-intelligence/src/use-case/generate-context.ts` — user-facing rendering for `code_context` test section
- `packages/supi-code-intelligence/src/use-case/generate-impact.ts` — changedFiles impact orchestration and likely-test evidence path
- `packages/supi-code-intelligence/src/use-case/generate-inspect.ts` — next-query guidance text that must match the public `code_context` contract
- `packages/supi-code-intelligence/src/tool/tool-specs.ts` and `packages/supi-code-intelligence/src/workflow/schemas.ts` — public metadata/guidance if wording must change to stay aligned
- `packages/supi-code-intelligence/README.md` — public package contract docs
- `packages/supi-code-intelligence/CLAUDE.md` — maintainer contract/gotcha docs
- `packages/supi-code-intelligence/__tests__/unit/analysis/relations-tests.test.ts` — shared discovery regressions
- `packages/supi-code-intelligence/__tests__/unit/tool/execute-graph.test.ts` — graph test-list rendering regressions
- `packages/supi-code-intelligence/__tests__/unit/code-context-tool.test.ts` — context test-list rendering regressions
- `packages/supi-code-intelligence/__tests__/unit/code-impact-tool.test.ts` — changedFiles evidence-path regressions
- `packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts` — public tool metadata/guidance assertions when wording changes

## Required behavior changes
### Test-name trust cleanup
- Discovery may still inspect structural outline data internally, but user-facing markdown for `code_graph` and `code_context` must never print helper/variable fallback names.
- If recognized test blocks are found, render only those names.
- If no recognized test blocks are found, render `_(no recognized test blocks)_` under the discovered test file.
- Any docs that currently imply helper names are always excluded must be updated to match the final runtime behavior precisely.

### changedFiles evidence contract cleanup
- `code_impact` with `changedFiles` must not use semantic references when assembling likely tests.
- The existing `**Evidence: structural**` footer remains, and its wording must match the actual runtime path.
- Any provenance or heading text shown for likely tests must stay consistent with this structural-only behavior.

### Guidance/doc cleanup
- `code_inspect` follow-up guidance must not tell users to call `code_context` with unsupported `file`-style public parameters.
- Public docs must stop listing stale shared-input surface like `path` / `exportedOnly` when describing the current public `code_*` contracts.
- README, CLAUDE.md, tool descriptions, schema descriptions, and registration assertions must describe the same behavior.

## Verification expectations
- focused unit tests must cover the noisy-name regressions and the changedFiles structural-only path
- package verification must pass for `packages/supi-code-intelligence`
- final repo verification must pass via `pnpm verify:ai`
