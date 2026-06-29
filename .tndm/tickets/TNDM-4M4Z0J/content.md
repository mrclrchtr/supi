## Overview
Reduce the SuPi-owned context cost of model-facing tool metadata by trimming verbose descriptions and parameter text, and by deduplicating repeated guidance where one shared family-level hint is enough. Keep every tool’s core routing contract intact and do not change runtime behavior.

## Planned file targets
- `packages/supi-lsp/src/tool/guidance.ts` — collapse repeated server-coverage guidance to the minimal useful shape and keep each `lsp_*` tool’s own routing hint concise.
- `packages/supi-lsp/src/tool/tool-specs.ts` — shorten model-facing LSP descriptions/snippets without changing schemas or execution.
- `packages/supi-code-intelligence/src/tool/guidance.ts` — compress cross-family routing guidance so it stays useful without repeating the same ideas across every `code_*` tool.
- `packages/supi-code-intelligence/src/tool/tool-specs.ts` — shorten `code_*` tool descriptions and any redundant base guidance.
- `packages/supi-tree-sitter/src/tool/tool-specs.ts` — trim structural-tool descriptions/guidance where wording is longer than necessary.
- `packages/supi-ask-user/src/schema.ts` — shorten the `ask_user` model-facing field descriptions, which are currently the largest single tool-definition contributor.
- `packages/supi-ask-user/src/tool/guidance.ts` — shorten the top-level `ask_user` description/guidelines without losing the blocking-decision contract.
- `packages/supi-web/src/tool/web-fetch-md-guidance.ts` — trim the long `web_fetch_md` description and redundant mode wording.
- `packages/supi-web/src/tool/web-docs-search-guidance.ts` and `packages/supi-web/src/tool/web-docs-fetch-guidance.ts` — shorten Context7 descriptions and overlapping guidance.
- `packages/supi-cache/src/tool/guidance.ts`, `packages/supi-debug/src/tool/guidance.ts`, and `packages/supi-rtk/src/tool/guidance.ts` — apply smaller safe wording trims.
- Relevant guidance/registration tests in each touched package — update assertions so the compact contract is explicit and regressions stay caught.

## Verification strategy
- Run focused vitest suites for every touched package’s guidance/registration/schema tests before broad verification.
- Finish with a cross-package lint + typecheck + targeted test sweep over the touched packages.
- Confirm the reduction with a before/after context audit, either through `/supi-context` or an equivalent local token-audit command that sums the touched guidance and tool-definition surfaces.

## Constraints
- No tool behavior changes.
- No unrelated refactors.
- Prefer shorter wording and shared-family deduplication over structural API changes.
