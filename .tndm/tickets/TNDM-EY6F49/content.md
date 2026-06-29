## Overview
Streamline the code-intelligence stack so each package owns its own expert tools and public metadata, while `@mrclrchtr/supi-code-intelligence` remains the orchestration layer that can add cross-family guidance.

## Approved architecture
- `packages/supi-lsp/` owns the semantic runtime, diagnostics UX, and all `lsp_*` expert tools.
- `packages/supi-tree-sitter/` owns the structural runtime and all `tree_sitter_*` expert tools.
- `packages/supi-code-intelligence/` owns the high-level `code_*` tools and may add cross-family tool-selection guidance.
- Installing `@mrclrchtr/supi-code-intelligence` must continue to activate `code_*`, `lsp_*`, and `tree_sitter_*` tools.
- Do **not** add a session-scoped cache or service to `supi-code-intelligence`.

## Scope
This is one coherent refactor across the code-understanding stack rather than multiple independent changes. The work should finish the split-tool migration, remove metadata/docs drift, and clarify package boundaries without changing the intended install surfaces.

## File map
### `packages/supi-lsp/`
- `packages/supi-lsp/src/tool/tool-specs.ts` — keep the single source of truth for `lsp_*` tool metadata and capability labels.
- `packages/supi-lsp/src/tool/guidance.ts` — keep derived LSP guidance, including dynamic server coverage.
- `packages/supi-lsp/src/tool/register-tools.ts` — keep registration thin and spec-driven.
- `packages/supi-lsp/src/handlers/session-lifecycle.ts` — keep dynamic re-registration of LSP tools/guidance at session start.
- `packages/supi-lsp/README.md` — update public tool docs to match the current split `lsp_*` surface.
- `packages/supi-lsp/__tests__/unit/tool-specs.test.ts`
- `packages/supi-lsp/__tests__/unit/guidance.test.ts`
- `packages/supi-lsp/__tests__/unit/focused-tools.test.ts` — keep regression coverage for the public tool surface and guidance.

### `packages/supi-tree-sitter/`
- `packages/supi-tree-sitter/src/tool/action-specs.ts` and/or `packages/supi-tree-sitter/src/tool/tool-specs.ts` — consolidate the split `tree_sitter_*` public metadata into one real source of truth.
- `packages/supi-tree-sitter/src/tool/guidance.ts` — replace the placeholder layer with derived guidance that matches the public tool surface.
- `packages/supi-tree-sitter/src/tool/register-tools.ts` — derive tool registration from the shared metadata instead of hardcoding drift-prone literals.
- `packages/supi-tree-sitter/src/tree-sitter.ts` — keep extension wiring thin after the metadata cleanup.
- `packages/supi-tree-sitter/README.md` — update from the old multiplexed `tree_sitter` docs to the actual split `tree_sitter_*` tools.
- `packages/supi-tree-sitter/__tests__/guidance.test.ts`
- `packages/supi-tree-sitter/__tests__/tool-focus.test.ts`
- `packages/supi-tree-sitter/__tests__/tool.test.ts` — cover the new spec/guidance/registration shape.

### `packages/supi-code-intelligence/`
- `packages/supi-code-intelligence/src/tool/tool-specs.ts` — keep `code_*` tool metadata package-local.
- `packages/supi-code-intelligence/src/tool/guidance.ts` — add explicit orchestration guidance for when to prefer `code_*`, `lsp_*`, and `tree_sitter_*` tools.
- `packages/supi-code-intelligence/src/tool/register-tools.ts` — keep registration thin and spec-driven.
- `packages/supi-code-intelligence/src/code-intelligence.ts` — keep overview injection only; do not introduce a new session-scoped service.
- `packages/supi-code-intelligence/README.md` — document that installing this package exposes all three tool families and explain the orchestration role clearly.
- `packages/supi-code-intelligence/__tests__/unit/guidance.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/tool-adapters.test.ts` — cover cross-family guidance and bundled install behavior.

## Verification strategy
- Use red-green-refactor for testable code changes.
- Add or update focused unit tests around tool specs, guidance, and registration before changing implementation.
- Run targeted package test suites and package-scoped typecheck/biome verification.
- Verify docs reflect actual public tool names and install behavior.

## Non-goals
- No new session-scoped cache/service in `supi-code-intelligence`.
- No change to the requirement that each package exposes its own expert tools.
- No change to the install behavior where `@mrclrchtr/supi-code-intelligence` activates all three tool families.
