## 1. Package scaffolding

- [x] 1.1 Create `packages/supi-tree-sitter/` with `package.json`, `tsconfig.json`, and workspace metadata following existing package patterns
- [x] 1.2 Add `web-tree-sitter`, `tree-sitter-javascript`, and `tree-sitter-typescript` as runtime peer dependencies, plus any dev/test dependency entries needed for local verification, using the WASM setup proven in commit `b48ba23e`
- [x] 1.3 Implement package-relative WASM asset resolution with `createRequire(import.meta.url)` and `require.resolve(<grammar>/package.json)`, covering `tree-sitter-javascript.wasm`, `tree-sitter-typescript.wasm`, and `tree-sitter-tsx.wasm`
- [x] 1.4 Ensure package `files` entries include the extension TypeScript source while relying on grammar package dependencies for `.wasm` assets instead of repository-relative paths
- [x] 1.5 Add `supi-tree-sitter` to the root `package.json` pi manifest extensions array
- [x] 1.6 Add the package to `packages/supi/package.json`, add `web-tree-sitter`, `tree-sitter-javascript`, and `tree-sitter-typescript` as `dependencies` in the meta-package so wrapper installs resolve grammar assets automatically, create a wrapper entrypoint such as `packages/supi/tree-sitter.ts`, and register it in the meta-package `pi.extensions` list
- [x] 1.7 Run `pnpm install` to refresh workspace links and lockfile entries

## 2. Runtime and language support

- [x] 2.1 Implement language detection for `.ts`, `.tsx`, `.js`, `.jsx`, `.mts`, `.cts`, `.mjs`, and `.cjs`
- [x] 2.2 Map JS-family files to the JavaScript grammar, TS/MTS/CTS files to the TypeScript grammar, and TSX files to the TSX grammar
- [x] 2.3 Implement lazy `web-tree-sitter` `Parser.init()`, `Language.load()`, parser creation, session reuse, and retry-after-failure behavior for grammar initialization
- [x] 2.4 Implement shared parse and query services for supported files
- [x] 2.5 Implement typed result unions for success, unsupported-language, validation/query errors, file access errors, and runtime failures
- [x] 2.6 Implement the unsupported-language result path for unsupported files and extensions
- [x] 2.7 Centralize conversion between public 1-based UTF-16 `line`/`character` coordinates and Tree-sitter runtime positions
- [x] 2.8 Resolve relative file paths from the current pi/session working directory and return structured errors for missing or unreadable files

## 3. Public service API

- [x] 3.1 Export the reusable service surface from the package root (`@mrclrchtr/supi-tree-sitter`) rather than only from internal files
- [x] 3.2 Provide a service factory or session acquisition helper that owns parser/grammar reuse for a pi session
- [x] 3.3 Define and export TypeScript types for parse results, query captures, outline items, import/export records, node lookup results, unsupported-language results, and validation errors
- [x] 3.4 Keep the tool implementation as a thin wrapper around exported runtime/structure services

## 4. Structural extraction services

- [x] 4.1 Implement outline extraction for top-level and nested declarations in supported files
- [x] 4.2 Implement import extraction for supported files
- [x] 4.3 Implement export extraction for supported files
- [x] 4.4 Implement `node_at` lookup with node type, 1-based range, and ancestry context
- [x] 4.5 Implement query-match formatting with capture names, node types, 1-based ranges, and invalid-query errors

## 5. Tool integration

- [x] 5.1 Create the `tree_sitter` extension entry point and register the tool with `outline`, `imports`, `exports`, `node_at`, and `query` actions
- [x] 5.2 Add validation for required/known `action`, required `file`/`query`, and positive 1-based integer `line`/`character` values
- [x] 5.3 Wire each tool action to the shared runtime/structure services rather than separate parsing logic
- [x] 5.4 Format tool responses as compact structural output and surface unsupported-language, file access, validation, and invalid-query results directly
- [x] 5.5 Cap large tool result sets and include explicit truncation notices for omitted outline items, imports, exports, query captures, or node context entries
- [x] 5.6 Document in the tool description and prompt guidance that coordinates are 1-based and compatible with the existing `lsp` tool convention, and that relative file paths resolve from the session working directory

## 6. Tests and verification

- [x] 6.1 Add unit tests for language detection, grammar selection, package-relative WASM path resolution, lazy parser reuse, retry-after-failure behavior, unsupported-language handling, and file access error handling
- [x] 6.2 Add unit tests for public coordinate conversion, including a non-ASCII source case
- [x] 6.3 Add unit tests for outline, imports, exports, node lookup, query result extraction, invalid-query handling, and truncation metadata/formatting
- [x] 6.4 Add integration tests for `tree_sitter` tool registration, validation, invalid/unknown actions, coordinate validation, file path resolution/error handling, truncation notices, and action routing
- [x] 6.5 Add a package/wrapper smoke test or equivalent verification that the direct package entrypoint and `packages/supi/tree-sitter.ts` wrapper can initialize the service, trigger parser initialization for at least one grammar, and verify the `.wasm` asset is readable from the resolved path
- [x] 6.6 Update the root `package.json` `typecheck` script to include `packages/supi-tree-sitter/tsconfig.json` and the meta-package wrapper surface, and update `typecheck:tests` as needed if the new tests get their own tsconfig
- [x] 6.7 Run `pnpm exec biome check --write packages/supi-tree-sitter/ packages/supi/tree-sitter.ts`
- [x] 6.8 Update the root `pack:check` script to dry-run published packages under `packages/` without matching the private workspace root (e.g. `pnpm --filter "./packages/supi*" exec pnpm pack --dry-run`), then run `pnpm --filter @mrclrchtr/supi-tree-sitter exec pnpm pack --dry-run` and `pnpm --filter @mrclrchtr/supi exec pnpm pack --dry-run`
- [x] 6.9 Run `pnpm typecheck`, `pnpm test`, and `pnpm verify`
