# Task 4: Remove unused devDeps from supi-lsp and supi-tree-sitter

## Goal

Remove `@mrclrchtr/supi-code-intelligence` from `devDependencies` in both `supi-lsp/package.json` and `supi-tree-sitter/package.json` — no source file in either package imports from it.

## Details

### supi-lsp/package.json:
```json
// Before
"devDependencies": {
  "@mrclrchtr/supi-code-intelligence": "workspace:*",
  "@mrclrchtr/supi-test-utils": "workspace:*",
  "vitest": "4.1.7"
},
// After
"devDependencies": {
  "@mrclrchtr/supi-test-utils": "workspace:*",
  "vitest": "4.1.7"
},
```

### supi-tree-sitter/package.json:
```json
// Before
"devDependencies": {
  "@mrclrchtr/supi-code-intelligence": "workspace:*",
  "@davisvaughan/tree-sitter-r": "1.2.0",
  ...
},
// After
"devDependencies": {
  "@davisvaughan/tree-sitter-r": "1.2.0",
  ...
},
```

### Step 3 — Run pnpm install to refresh lockfile:
```bash
pnpm install
```

## Verification

- `pnpm exec tsc --noEmit -p packages/supi-lsp/tsconfig.json` passes (no missing module errors)
- `pnpm exec tsc --noEmit -p packages/supi-tree-sitter/tsconfig.json` passes
- Grep confirms no source files in either package import from `@mrclrchtr/supi-code-intelligence`
