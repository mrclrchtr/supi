## 1. Package scaffolding

- [ ] 1.1 Create `packages/supi-tree-sitter/` with `package.json`, `tsconfig.json`, and workspace metadata following existing package patterns
- [ ] 1.2 Add the Tree-sitter runtime and JavaScript/TypeScript grammar dependencies needed for a WASM-based implementation
- [ ] 1.3 Add `supi-tree-sitter` to the root `package.json` pi manifest extensions array
- [ ] 1.4 Add the package to `packages/supi/package.json`, create a wrapper entrypoint such as `packages/supi/tree-sitter.ts`, and register it in the meta-package `pi.extensions` list
- [ ] 1.5 Run `pnpm install` to refresh workspace links and lockfile entries

## 2. Runtime and language support

- [ ] 2.1 Implement language detection for `.ts`, `.tsx`, `.js`, `.jsx`, `.mts`, `.cts`, `.mjs`, and `.cjs`
- [ ] 2.2 Implement lazy grammar/parser initialization and session reuse for the JS/TS grammar family
- [ ] 2.3 Implement shared parse and query services for supported files
- [ ] 2.4 Implement the unsupported-language result path for unsupported files and extensions

## 3. Structural extraction services

- [ ] 3.1 Implement outline extraction for top-level and nested declarations in supported files
- [ ] 3.2 Implement import and export extraction for supported files
- [ ] 3.3 Implement `node_at` lookup with node type, range, and ancestry context
- [ ] 3.4 Implement query-match formatting with capture names, node types, and ranges

## 4. Tool integration

- [ ] 4.1 Create the `tree_sitter` extension entry point and register the tool with `outline`, `imports`, `node_at`, and `query` actions
- [ ] 4.2 Add action-specific parameter validation for `file`, `line`, `character`, and `query`
- [ ] 4.3 Wire each tool action to the shared runtime/structure services rather than separate parsing logic
- [ ] 4.4 Format tool responses as compact structural output and surface unsupported-language results directly

## 5. Tests and verification

- [ ] 5.1 Add unit tests for language detection, lazy parser reuse, and unsupported-language handling
- [ ] 5.2 Add unit tests for outline, imports/exports, node lookup, and query result extraction
- [ ] 5.3 Add integration tests for `tree_sitter` tool registration, validation, and action routing
- [ ] 5.4 Update the root `package.json` `typecheck` script to include `packages/supi-tree-sitter/tsconfig.json`, and update `typecheck:tests` as needed if the new tests get their own tsconfig
- [ ] 5.5 Run `pnpm exec biome check --write packages/supi-tree-sitter/`
- [ ] 5.6 Run `pnpm typecheck`, `pnpm test`, and `pnpm verify`
