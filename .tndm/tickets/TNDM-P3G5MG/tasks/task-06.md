# Task 6: Full verification — tests, typecheck, extension surface

**Goal:** Confirm the entire change works end-to-end.

**Verification steps:**

1. **TypeScript compilation:**
   ```
   pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json packages/supi-code-intelligence/__tests__/tsconfig.json
   ```
   Must produce zero errors.

2. **Full test suite:**
   ```
   pnpm vitest run packages/supi-code-intelligence/
   ```
   All 346+ existing tests pass, plus new `code-find-tool.test.ts` tests pass. No regressions.

3. **Extension surface check:**
   - `code_find` is registered in the public tool set
   - `code_pattern` is still registered (not removed)
   - No `lsp_*` or `tree_sitter_*` tools leak
   - Other V2 inactive tools (`code_context`, `code_graph`, `code_impact`, `code_refactor`, `code_apply`) remain unregistered

4. **Biome lint:**
   ```
   pnpm exec biome check packages/supi-code-intelligence/src/tool/execute-find.ts packages/supi-code-intelligence/__tests__/unit/code-find-tool.test.ts packages/supi-code-intelligence/src/intent/types.ts packages/supi-code-intelligence/src/tool/tool-specs.ts packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts
   ```
   Zero errors.

5. **Manual smoke (optional):**
   - `/reload` in pi
   - Call `code_find` with `query: "registerTool"` — should return text matches
   - Call `code_find` with `query: "registerTool", mode: "regex"` — should return regex matches
   - Verify `code_pattern` still works

**Verification:** All commands pass with zero errors.
