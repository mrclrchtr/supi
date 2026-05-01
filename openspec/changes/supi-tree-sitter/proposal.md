## Why

SuPi has `supi-lsp` for semantic, language-server-backed code intelligence, but it lacks a reusable parser layer for structural analysis when LSP is unavailable, incomplete, or too high-level for the task. A standalone Tree-sitter extension gives SuPi and future extensions a shared AST/query substrate that can be used independently and later composed into a higher-level `supi-code-intelligence` experience.

## What Changes

- Add a new `supi-tree-sitter` workspace package as a reusable Tree-sitter-based extension for pi
- Restore the proven WASM Tree-sitter setup from commit `b48ba23e`: `web-tree-sitter`, npm grammar packages, package-relative `.wasm` asset resolution via `createRequire(import.meta.url)` / `require.resolve`, and lazy parser initialization
- Register a technical `tree_sitter` tool with focused actions for structural code inspection: `outline`, `imports`, `exports`, `node_at`, and `query`
- Provide shared parser/runtime services so other extensions can consume Tree-sitter parsing, query, outline, import/export, and node-lookup capabilities without reimplementing grammar loading or AST traversal
- Publish the extension through both install surfaces used by this repo: the workspace root manifest and the published `@mrclrchtr/supi` meta-package wrapper surface
- Return clear unsupported-language results for files without configured Tree-sitter support rather than using heuristic fallbacks
- Establish the structural foundation that a future `supi-code-intelligence` extension can use alongside `supi-lsp`

## Capabilities

### New Capabilities
- `tree-sitter-runtime`: Manage Tree-sitter parsers, supported-language detection, WASM grammar asset loading, and reusable parse/query services for other extensions
- `tree-sitter-tool`: Expose the `tree_sitter` tool with `outline`, `imports`, `exports`, `node_at`, and `query` actions for direct agent use
- `tree-sitter-structure`: Extract structural file information such as outlines, imports, exports, and position-based node lookup from supported languages

### Modified Capabilities
- None

## Impact

- **New package**: `packages/supi-tree-sitter/`
- **Root manifest**: `package.json` pi manifest gains a `supi-tree-sitter` extension entry
- **Published meta-package**: `packages/supi/package.json` gains the package dependency and `pi.extensions` wrapper entry, plus a local wrapper file such as `packages/supi/tree-sitter.ts`
- **Verification scripts**: root `package.json` `typecheck` script is updated to include `packages/supi-tree-sitter/tsconfig.json`, the meta-package wrapper surface is typechecked, and any new test tsconfig is added to `typecheck:tests`
- **Pack checks**: package dry-run checks verify that both `@mrclrchtr/supi-tree-sitter` and the `@mrclrchtr/supi` meta-package include the expected TypeScript entrypoints and can resolve runtime grammar dependencies
- **Dependencies**: declares `web-tree-sitter`, `tree-sitter-javascript`, and `tree-sitter-typescript` as runtime peer dependencies, ensures the published `@mrclrchtr/supi` meta-package wrapper surface also satisfies those runtime peers, and adds matching development/test install support as needed, using the same portable WASM approach previously proven in commit `b48ba23e`
- **Future integration**: creates a reusable substrate for a later `supi-code-intelligence` extension without changing existing `supi-lsp` behavior
