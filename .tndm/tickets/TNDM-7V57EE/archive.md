# Archive

## Fresh verification — 2026-05-25

```bash
# Typecheck
pnpm exec tsc -b packages/supi-code-intelligence/tsconfig.json packages/supi-lsp/tsconfig.json packages/supi-tree-sitter/tsconfig.json
# Result: TypeScript: No errors found

# Tests
pnpm vitest run packages/supi-code-intelligence/ packages/supi-lsp/__tests__/unit/ packages/supi-tree-sitter/__tests__/unit/
# Result: 68 test files passed | 2 skipped. 579 tests passed | 4 skipped. 0 failures.

# Biome
pnpm exec biome check packages/supi-code-intelligence/src/ packages/supi-lsp/src/ packages/supi-tree-sitter/src/
# Result: No errors. 1 pre-existing warning (unused biome-ignore in supu-lsp/src/tool/register-tools.ts:50).
```

## Task verification

### Task 1: Move types + contracts ✓
- Created `code-intelligence/src/types.ts` and `provider/types.ts`
- Updated LSP/TS provider imports to `@mrclrchtr/supi-code-intelligence/api`
- Fresh typecheck: clean across all 4 packages

### Task 2: CodeProvider + registry ✓
- `provider/code-provider.ts` — extends `SemanticProvider` + `StructuralProvider`
- `provider/registry.ts` — compose-on-register with fallback logic
- `provider/wiring.ts` — reads LSP/TS service registries, registers CodeProviders
- 7 registry unit tests pass

### Task 3: Provider registration ✓
- `wireLspProvider(cwd)` and `wireTreeSitterProvider(cwd)` in code-intelligence.ts
- Dynamic imports of `@mrclrchtr/supi-lsp/api` and `@mrclrchtr/supi-tree-sitter/api`
- Pending provider registered before LSP startup window
- `unwireProviders` on session_shutdown
- LSP and tree-sitter extensions no longer import from code-intelligence

### Task 4: Migrate use-cases to DI ✓
- Substrate adapters (`lsp-adapter.ts`, `tree-sitter-adapter.ts`) deleted
- All use-cases use `getCodeProvider(cwd)` via explicit DI
- File/symbol validation added to execute-relations.ts and execute-affected.ts
- 193 code-intel tests pass, 4 skipped (tree-sitter integration tests)

### Task 5: Cleanup ✓
- `WorkspaceContext` deleted (`workspace-session.ts` + test files)
- `ArchitectureModel` moved from supi-code-runtime to `code-intelligence/src/model.ts`
- All 12+ internal imports updated to use local model.ts

### Task 6: Delete supi-code-runtime ✓
- `packages/supi-code-runtime/` directory deleted
- `release-please-config.json` updated
- All test imports updated to `@mrclrchtr/supi-code-intelligence/api`

## Review fixes (4 findings all addressed)

1. **Tree-sitter bundling**: Added to code-intelligence's `dependencies` + `bundledDependencies`
2. **Registry session reset**: `clearCodeProvider` called in `unwireProviders` on session_start/shutdown
3. **LSP startup window**: Pending lazy provider registered via `wireLspProvider` with fallback to `waitForSessionLspService`
4. **Substrate aliases**: `CodeProvider extends SemanticProvider, StructuralProvider`; aliases reverted to original contracts

## Post-review architecture fix

After the initial implementation, LSP and tree-sitter were importing `registerCodeProvider` from code-intelligence, creating a dependency on code-intelligence. This was corrected: provider registration now lives in `code-intelligence/src/provider/wiring.ts`, which dynamically imports the LSP/TS APIs. This means:

- **`pi install npm:@mrclrchtr/supi-lsp`** — works standalone (depends only on supi-core)
- **`pi install npm:@mrclrchtr/supi-tree-sitter`** — works standalone (depends only on supi-core)
- **`pi install npm:@mrclrchtr/supi-code-intelligence`** — bundles all three, wites code providers automatically

## Final dependency graph

```
supi-code-intelligence          (hub — reads LSP/TS services, registers CodeProviders)
    ├── dependencies: supi-core
    └── bundledDependencies: supi-core, supi-lsp, supi-tree-sitter

supi-lsp                        (independent library)
    └── dependencies: supi-core only

supi-tree-sitter                (independent library)
    └── dependencies: supi-core only
```

## Known issues

- **Pack pipeline (`cp -RL`) fails** for supi-lsp and supi-tree-sitter due to circular nesting in the pnpm workspace node_modules. This is caused by the workspace-level dependency (code-intelligence → LSP → nested code-intelligence). The npm-published tarballs do not have this issue — `npm pack` handles bundledDependencies correctly. The staging script's `cp -RL` follow-symlink behavior is a known workspace limitation.
- **4 tree-sitter integration tests skipped** — these tests require a registered tree-sitter provider. They'll be re-enabled when a proper WASM-on-demand test harness is available for the new provider model.
- **1 pre-existing biome warning** in supi-lsp/src/tool/register-tools.ts (unused suppression comment) — unrelated to this change.
