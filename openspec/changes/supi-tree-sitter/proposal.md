## Why

SuPi has `supi-lsp` for semantic, language-server-backed code intelligence, but it lacks a reusable parser layer for structural analysis when LSP is unavailable, incomplete, or too high-level for the task. A standalone Tree-sitter extension gives SuPi and future extensions a shared AST/query substrate that can be used independently and later composed into a higher-level `supi-code-intelligence` experience.

## What Changes

- Add a new `supi-tree-sitter` workspace package as a reusable Tree-sitter-based extension for pi
- Register a technical `tree_sitter` tool with focused actions for structural code inspection: `outline`, `imports`, `node_at`, and `query`
- Provide shared parser/runtime services so other extensions can consume Tree-sitter parsing and query capabilities without reimplementing grammar loading or AST traversal
- Publish the extension through both install surfaces used by this repo: the workspace root manifest and the published `@mrclrchtr/supi` meta-package wrapper surface
- Return clear unsupported-language results for files without configured Tree-sitter support rather than using heuristic fallbacks
- Establish the structural foundation that a future `supi-code-intelligence` extension can use alongside `supi-lsp`

## Capabilities

### New Capabilities
- `tree-sitter-runtime`: Manage Tree-sitter parsers, supported-language detection, and reusable parse/query services for other extensions
- `tree-sitter-tool`: Expose the `tree_sitter` tool with `outline`, `imports`, `node_at`, and `query` actions for direct agent use
- `tree-sitter-structure`: Extract structural file information such as outlines, imports, exports, and position-based node lookup from supported languages

### Modified Capabilities
- None

## Impact

- **New package**: `packages/supi-tree-sitter/`
- **Root manifest**: `package.json` pi manifest gains a `supi-tree-sitter` extension entry
- **Published meta-package**: `packages/supi/package.json` gains the package dependency and `pi.extensions` wrapper entry, plus a local wrapper file such as `packages/supi/tree-sitter.ts`
- **Verification scripts**: root `package.json` `typecheck` script is updated to include `packages/supi-tree-sitter/tsconfig.json` and any new test tsconfig if one is added
- **Dependencies**: adds Tree-sitter runtime dependencies and language grammars needed for initial supported languages
- **Future integration**: creates a reusable substrate for a later `supi-code-intelligence` extension without changing existing `supi-lsp` behavior
