# Task 4: Re-home the Tree-sitter pi adapter and expert structural tools in supi-code-intelligence

## Goal
Move the entire Tree-sitter-facing pi adapter into `packages/supi-code-intelligence` while keeping `packages/supi-tree-sitter` as the runtime library.

## Changes
1. Add a new `packages/supi-code-intelligence/src/tree-sitter/` domain for the structural adapter.
   - `session-lifecycle.ts` should consume the new `@mrclrchtr/supi-tree-sitter/api` controller.
   - `tool-specs.ts`, `guidance.ts`, `register-tools.ts`, and `tool-actions.ts` should become the new owner of the public `tree_sitter_*` tool metadata and execution wiring.
2. Update `packages/supi-code-intelligence/src/code-intelligence.ts` so the extension wires the Tree-sitter adapter alongside the existing `code_*` tools and the new LSP adapter.
3. Update `packages/supi-code-intelligence/package.json` so it no longer loads `node_modules/@mrclrchtr/supi-tree-sitter/src/extension.ts` through `pi.extensions` once the local umbrella adapter exists.
4. Keep the old `packages/supi-tree-sitter` extension files in place temporarily; the later cleanup task will delete them after the umbrella adapter is proven.

## Test plan
- Update `packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts` first so it fails until the package registers the `tree_sitter_*` tools itself.
- Add focused umbrella-package tests for tree-sitter guidance and registration in the exact new test files listed above.
- Reuse the substrate package tests only for the new runtime-controller contract, not for pi tool registration.
