# Task 7: Update LSP integration tests for focused tools

Integration tests that reference old tool names must be updated. Check and update:

**`__tests__/integration/e2e-smoke.test.ts`:**
- Replace `LSP_TOOL_NAMES` list entries: `"lsp_lookup"` → `"lsp_hover"`, `"lsp_definition"`, `"lsp_references"`, `"lsp_implementation"`; `"lsp_refactor"` → `"lsp_rename"`, `"lsp_code_actions"`
- Replace `pi.tools.find((t) => t.name === "lsp_lookup")` assertions with per-tool assertions for each focused tool
- Replace `pi.tools.find((t) => t.name === "lsp_refactor")` assertions with per-tool assertions

**`__tests__/integration/` other files:**
- Check `service-actions.integration.test.ts`, `service-actions-workspace.integration.test.ts` for references to old tool names or params

Run full integration suite to confirm nothing broken:
```bash
pnpm exec vitest run packages/supi-lsp/__tests__/integration/
```
