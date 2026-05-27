# Task 4: Guard Phase 0 against accidental runtime surface changes

# Goal

Ensure Phase 0 remains a skeleton-only change: no V2 workflow tools are registered, and the current public runtime tool surface remains unchanged.

# Files

Modify if needed:

- `packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts`
- `packages/supi-code-intelligence/__tests__/unit/workflow-surface.test.ts`

Read-only/reference:

- `packages/supi-code-intelligence/src/code-intelligence.ts`
- `packages/supi-code-intelligence/src/tool/register-tools.ts`
- `packages/supi-code-intelligence/src/lsp/register-tools.ts`
- `packages/supi-code-intelligence/src/tree-sitter/register-tools.ts`

# Test-driven steps

1. Add or extend tests to assert planned V2 workflow tool names are not registered by `codeIntelligenceExtension()` in Phase 0.
2. Keep existing assertions that current `code_*`, `lsp_*`, and `tree_sitter_*` tools are registered. If current tests already cover this, add only the negative V2 registration assertion.
3. Do not change extension wiring except to satisfy TypeScript imports if required by the skeleton. Runtime registration should remain unchanged.

# Verification

Run:

```bash
RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts packages/supi-code-intelligence/__tests__/unit/workflow-surface.test.ts -v
```

Expected result: tests prove that Phase 0 introduces no active V2 tools and does not remove current tools.

