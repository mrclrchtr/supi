# Task 4: Trim web and smaller support-tool guidance surfaces

## Goal
Capture the smaller but easy metadata wins after the big LSP/code-intelligence/ask-user reductions.

## Changes
- In `packages/supi-web/src/tool/web-fetch-md-guidance.ts`, shorten the long top-level description and reduce redundant output-mode wording while keeping the public-URL and access-control guardrails.
- In `packages/supi-web/src/tool/web-docs-search-guidance.ts` and `packages/supi-web/src/tool/web-docs-fetch-guidance.ts`, shorten Context7 descriptions and overlapping routing bullets.
- In `packages/supi-cache/src/tool/guidance.ts`, `packages/supi-debug/src/tool/guidance.ts`, and `packages/supi-rtk/src/tool/guidance.ts`, trim wording without dropping the key behavior caveats.
- Update the corresponding guidance tests so they keep asserting the important tool names and guardrails, not the old verbose copy.

## Constraints
- Preserve the GitHub/`gh` special case for `web_fetch_md` when available.
- Preserve the RTK `RTK_DISABLED=1` escape hatch mention.
- Preserve the sanitized-vs-raw distinction for `supi_debug`.
