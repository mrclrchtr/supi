# Task 2: Compact code-intelligence and tree-sitter guidance without losing routing clarity

## Goal
Reduce the next-largest guidance surfaces by compressing `code_*` cross-family routing and trimming `tree_sitter_*` descriptions/guidelines.

## Changes
- Update `packages/supi-code-intelligence/__tests__/unit/guidance.test.ts` so it still requires cross-family steering, but no longer depends on the current verbose phrasing.
- Keep `packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts` validating focused descriptions after the wording changes.
- In `packages/supi-code-intelligence/src/tool/guidance.ts`, keep only the cross-family hints that materially help the model choose between `code_*`, `lsp_*`, and `tree_sitter_*`.
- In `packages/supi-code-intelligence/src/tool/tool-specs.ts`, shorten base descriptions/guidelines where the same idea is already covered elsewhere.
- In `packages/supi-tree-sitter/src/tool/tool-specs.ts`, trim structural-tool descriptions/guidance while keeping them standalone-safe and explicit about outline/import/export/query/node/callee roles.
- Update the tree-sitter guidance tests to assert capability coverage rather than the old longer wording.

## Constraints
- Preserve the focused tool split and standalone-safe tree-sitter guidance.
- Do not add new routing layers or runtime behavior.
