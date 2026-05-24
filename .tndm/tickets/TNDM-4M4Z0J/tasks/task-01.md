# Task 1: Compact LSP prompt guidance and metadata with deduped server coverage

## Goal
Cut the largest SuPi guideline hotspot by shrinking `lsp_*` descriptions and making the dynamic server-coverage guidance appear in the smallest still-useful shape.

## Changes
- Update `packages/supi-lsp/__tests__/unit/guidance.test.ts` first so it encodes the new compact coverage contract instead of the current repeated-per-tool expectation.
- Adjust `packages/supi-lsp/__tests__/unit/tool-specs.test.ts` and `packages/supi-lsp/__tests__/unit/focused-tools.test.ts` as needed so they still assert the focused-tool public surface without pinning the old verbose wording.
- In `packages/supi-lsp/src/tool/guidance.ts`, keep the dynamic coverage information, but stop attaching the same long server bullets to every position-based tool.
- In `packages/supi-lsp/src/tool/tool-specs.ts`, shorten model-facing descriptions and prompt snippets where the current wording is longer than necessary.

## Constraints
- Do not change schemas, tool names, or runtime behavior.
- Keep coverage text standalone-readable when it appears in the flattened system prompt.
