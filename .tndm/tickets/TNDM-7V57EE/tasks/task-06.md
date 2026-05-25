# Task 6: Phase 6: Delete supi-code-runtime package, finalize all imports and manifests

## Goal

Delete the `supi-code-runtime` package entirely. All its exports now live in `supi-code-intelligence/api`. Update every remaining import to point to `@mrclrchtr/supi-code-intelligence/api`.

## Pre-flight audit

Before deleting anything, find every remaining import from `@mrclrchtr/supi-code-runtime`:

```bash
rg "@mrclrchtr/supi-code-runtime" packages/ --files-with-matches
```

Expected results (after Phases 1-5):
- `packages/supi-code-intelligence/package.json` — should already NOT depend on it
- `packages/supi-lsp/src/provider/lsp-semantic-provider.ts` — should already import from code-intelligence
- `packages/supi-tree-sitter/src/provider/tree-sitter-provider.ts` — should already import from code-intelligence
- Any test files that mock `@mrclrchtr/supi-code-runtime/api`

## Steps

### 1. Update remaining imports in all packages

For every file still importing from `@mrclrchtr/supi-code-runtime/api`:
- Change to `@mrclrchtr/supi-code-intelligence/api`

### 2. Update package.json dependencies

- `packages/supi-lsp/package.json` — replace `@mrclrchtr/supi-code-runtime` with `@mrclrchtr/supi-code-intelligence` in dependencies and bundledDependencies (if not already done in Phase 3)
- `packages/supi-tree-sitter/package.json` — same
- `packages/supi-code-intelligence/package.json` — ensure no reference to `supi-code-runtime` remains

### 3. Update test configurations

- `packages/supi-lsp/__tests__/tsconfig.json` — update paths if needed
- `packages/supi-tree-sitter/__tests__/tsconfig.json` — update paths
- `packages/supi-code-intelligence/__tests__/tsconfig.json` — update paths

### 4. Update root workspace configuration

- Root `package.json` — remove `packages/supi-code-runtime` from `pi.extensions` array (it was never a pi extension, but check)
- `.release-please-config.json` — remove `packages/supi-code-runtime/package.json` from `extra-files`

### 5. Delete the package

```bash
rm -rf packages/supi-code-runtime/
```

### 6. Run pnpm install to clean up workspace

```bash
pnpm install
```

### 7. Update any remaining references

```bash
rg "supi-code-runtime" . --files-with-matches -g '!node_modules' -g '!.git'
```

Expected hits:
- `.release-please-config.json` — already handled
- Possibly docs files — update to reference `supi-code-intelligence` instead

### 8. Update publish pipeline

- `scripts/publish.mjs` — remove any special-casing for supi-code-runtime
- `scripts/pack-all.mjs` — remove from the packages list
- `scripts/pack-staged.mjs` — no changes needed if it discovers packages dynamically

### 9. Update package-layout docs

- `docs/package-layout.md` — remove supi-code-runtime entry if present

## Verification

```bash
# Full typecheck across all packages
pnpm exec tsc -b

# Run all tests
pnpm vitest run

# Biome across all packages
pnpm exec biome check packages/

# Pack verification for all packages
pnpm pack:verify

# Confirm no references remain
rg "supi-code-runtime" . --files-with-matches -g '!node_modules' -g '!.git' -g '!.tndm'
# Should return zero results (or only docs/historical references)
```

## Final architecture check

```bash
# Verify dependency direction — code-intelligence must NOT depend on LSP or tree-sitter
rg "from.*supi-lsp" packages/supi-code-intelligence/src/ --files-with-matches
rg "from.*supi-tree-sitter" packages/supi-code-intelligence/src/ --files-with-matches
# Both should return zero results

# Verify LSP and tree-sitter DO depend on code-intelligence
rg "from.*supi-code-intelligence" packages/supi-lsp/src/
rg "from.*supi-code-intelligence" packages/supi-tree-sitter/src/
# Both should show matches
```

