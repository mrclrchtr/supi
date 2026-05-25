# Archive

## Fresh verification — all 7 tasks

### Tests
- `RTK_DISABLED=1 pnpm vitest run packages/supi-code-runtime/ packages/supi-lsp/ packages/supi-tree-sitter/ packages/supi-code-intelligence/ scripts/__tests__/bundled-extension-refs.test.mjs scripts/__tests__/pack-staged.test.mjs` → **923 passed, 0 failed**
- 99 test files across all 4 code packages + 2 packaging tests

### TypeScript
- `pnpm exec tsc -b packages/{supi-code-runtime,supi-lsp,supi-tree-sitter,supi-code-intelligence}/tsconfig.json` → **No errors found**
- `pnpm exec tsc --noEmit -p packages/{supi-code-runtime,supi-lsp,supi-tree-sitter,supi-code-intelligence}/__tests__/tsconfig.json` → **No errors found**

### Biome
- `pnpm exec biome check packages/{supi-code-runtime,supi-lsp,supi-tree-sitter,supi-code-intelligence}/` → **0 errors, 46 warnings** (all `noDeprecatedImports` from intentional compatibility wrapper — expected migration artifact)

### Pack verification
- `pnpm pack:verify` → **All 17 packages verified** (includes new `supi-code-runtime`)

### Bundled extension references
- `scripts/__tests__/bundled-extension-refs.test.mjs` → **passing** (supi-code-runtime kept as regular dep, not bundled)

## Architectural deliverables
- New shared package: `packages/supi-code-runtime/` (library-only, canonical types + provider contracts + project model + workspace context)
- `packages/supi-lsp/src/provider/lsp-semantic-provider.ts` — shared SemanticProvider adapter
- `packages/supi-tree-sitter/src/provider/tree-sitter-provider.ts` — shared StructuralProvider adapter
- `packages/supi-lsp/src/manager/` — decomposed subsystems (client-pool, workspace-router, diagnostic-store, recovery-coordinator, capability-index)
- `packages/supi-code-intelligence/src/substrates/` — adapters delegate to shared providers
- `packages/supi-code-intelligence/src/architecture.ts` — compatibility wrapper over runtime project model
- Updated `release-please-config.json`, `docs/package-layout.md`, package READMEs and CLAUDEs
