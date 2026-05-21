# Archive

Fresh verification and archive evidence for TNDM-9WNESE:

Plan/task status:
- Reviewed ticket metadata and task list fresh via `supi_tndm_cli show/list`; all 4 planned tasks are marked done.
- Reviewed `git diff --stat -- packages/supi-core packages/supi-lsp packages/supi-tree-sitter docs/tool-architecture.md`; the code/docs delta matches the scoped session-registry refactor.
- Deviation explained: task 2 listed `packages/supi-tree-sitter/package.json`, but no manifest edit was needed because `@mrclrchtr/supi-core` was already present in both `dependencies` and `bundledDependencies`. Packaging was still re-verified fresh.

Fresh shell verification:
1. `pnpm exec biome check packages/supi-core packages/supi-lsp packages/supi-tree-sitter --max-diagnostics=20`
   - Exit status: 0
   - Result: `Checked 196 files ... No fixes applied.`
2. `pnpm vitest run packages/supi-core/__tests__/unit/registry-utils.test.ts packages/supi-lsp/__tests__/unit/service-registry.test.ts packages/supi-tree-sitter/__tests__/service-registry.test.ts -v`
   - Exit status: 0
   - Result: `Test Files 3 passed (3)` / `Tests 36 passed (36)`
3. `pnpm exec tsc --noEmit -p packages/supi-core/tsconfig.json`
   - Exit status: 0
4. `pnpm exec tsc --noEmit -p packages/supi-core/__tests__/tsconfig.json`
   - Exit status: 0
5. `pnpm exec tsc --noEmit -p packages/supi-lsp/tsconfig.json`
   - Exit status: 0
6. `pnpm exec tsc --noEmit -p packages/supi-lsp/__tests__/tsconfig.json`
   - Exit status: 0
7. `pnpm exec tsc --noEmit -p packages/supi-tree-sitter/tsconfig.json`
   - Exit status: 0
8. `pnpm exec tsc --noEmit -p packages/supi-tree-sitter/__tests__/tsconfig.json`
   - Exit status: 0
9. `node scripts/publish.mjs packages/supi-tree-sitter`
   - Exit status: 0
   - Result: tarball packed and `Verified: OK` / `Ready to publish.`

Fresh live PI verification after reload:
1. `tree_sitter { action: "outline", file: "packages/supi-tree-sitter/src/tree-sitter.ts" }`
   - Result: returned a valid outline for `tree-sitter.ts`
2. `lsp_document_symbols { file: "packages/supi-lsp/src/session/service-registry.ts" }`
   - Result: returned semantic symbols for the refactored LSP registry module, including `getSessionLspService`, `setSessionLspServiceState`, `waitForSessionLspService`, and `clearSessionLspService`
3. `code_intel { action: "callers", file: "packages/supi-core/src/registry-utils.ts", line: 66, character: 1 }`
   - Result: returned a semantic caller list showing references from `packages/supi-core/src/api.ts`, `packages/supi-core/src/index.ts`, and `packages/supi-lsp/src/session/service-registry.ts`
4. `code_intel { action: "callees", file: "packages/supi-tree-sitter/src/tree-sitter.ts", line: 124, character: 10 }`
   - Result: returned structural callees for `executeToolAction`

Fresh doc-accuracy check:
- Ran `rg -n "createSessionStateRegistry|session registry|session-state helper|shared core session-registry helper" docs/tool-architecture.md packages/supi-core/CLAUDE.md packages/supi-lsp/CLAUDE.md packages/supi-tree-sitter/CLAUDE.md`
- Result: the updated docs explicitly reference the shared core helper and correctly describe that LSP and Tree-sitter delegate normalized-cwd session storage to `createSessionStateRegistry()` while keeping package-specific state semantics local.

Conclusion:
- The implementation matches the approved design: shared normalized-cwd session-state storage now lives in `supi-core`, while LSP and Tree-sitter retain package-local state wrappers and LSP keeps its local wait semantics.
- Documentation matches the final implementation.
- All planned verification evidence was run fresh and passed.
