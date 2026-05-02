## Why

SuPi now has the lower-level code-understanding substrates needed for a higher-level agent product: `supi-lsp` exposes a reusable session LSP service, `supi-tree-sitter` exposes parser-backed structure, and `supi-core` exposes project/root utilities. Agents still lack a single, inviting interface for architectural context, caller/impact analysis, and fallback orchestration across those layers. `supi-code-intelligence` should turn raw semantics and structure into concise, actionable guidance that agents naturally reach for before reading too many files or running broad searches.

## What Changes

- Add a new `supi-code-intelligence` workspace package as the main agent-facing code understanding extension for SuPi
- Register a `code_intel` tool with high-level actions: `brief`, `callers`, best-effort v1 `callees`, `implementations`, `affected`, and `pattern`
- Make follow-up flows low-friction: public positions match the existing 1-based `lsp` / `tree_sitter` convention, ambiguous symbol responses include retry-ready coordinates, and search actions can be scoped for token-efficient refinement
- Inject a lightweight architecture/module overview once per session so agents start with structural context
- Synthesize results from the public `@mrclrchtr/supi-lsp` service API and `@mrclrchtr/supi-tree-sitter` session API, preferring LSP for semantic truth, using Tree-sitter for structural enrichment/fallback, and using text search as a last resort
- Consume shared project-root utilities from `supi-core` for architecture-model scanning instead of duplicating root/path logic
- Provide compact, motivating `promptSnippet` and `promptGuidelines` that make agents want to use `code_intel` for orientation, impact checks, and semantic relationship questions while deconflicting existing `lsp` / `tree_sitter` guidance
- Publish the extension through both install surfaces used by this repo: the workspace root manifest and the published `@mrclrchtr/supi` meta-package wrapper surface

## Capabilities

### New Capabilities
- `code-intelligence-brief`: Generate session-start architecture overviews and on-demand focused briefs for the repo or a specific path
- `code-intelligence-search`: Expose the `code_intel` tool actions for callers, callees, implementations, and pattern search with structured summarized output, machine-readable details metadata, and agent-friendly usage guidance
- `code-intelligence-affected`: Analyze the blast radius of changing a symbol, including direct references, downstream modules, and risk level

### Existing Capabilities Consumed
- `lsp-client`: existing public `getSessionLspService()` / `SessionLspService` APIs provide shared semantic lookups, document/workspace symbols, implementation lookup, project server info, and diagnostics
- `tree-sitter-runtime`: existing public `createTreeSitterSession()` APIs provide parser-backed outlines, imports, exports, node lookup, and query support
- `project-root-utilities`: existing `supi-core` project/root helpers provide reusable root walking, known-root mapping, and path containment utilities

## Impact

- **New package**: `packages/supi-code-intelligence/`
- **Root manifest**: `package.json` pi manifest gains a `supi-code-intelligence` extension entry
- **Published meta-package**: `packages/supi/package.json` gains the package dependency and `pi.extensions` wrapper entry, plus a local wrapper file such as `packages/supi/code-intelligence.ts`
- **Dependencies**: `supi-code-intelligence` depends on `supi-lsp`, `supi-tree-sitter`, `supi-core`, and required pi peer dependencies
- **Prerequisite state**: substrate work has landed separately: `extract-project-root-utils`, `supi-tree-sitter`, and `stabilize-code-intelligence-substrates` are available in the current codebase
- **Verification scripts**: root `typecheck` / `typecheck:tests` already iterate over `packages/*`; implementation should verify the new package is picked up by those globs rather than adding a one-off script entry
- **Agent prompt**: session-start architecture context and `code_intel` tool guidance are added without changing the existing `lsp` or `tree_sitter` tool surfaces
