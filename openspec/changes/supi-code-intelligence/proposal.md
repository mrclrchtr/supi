## Why

SuPi now has a clear layered direction: technical substrates such as `supi-lsp` and `supi-tree-sitter`, plus one agent-facing code understanding product. Agents still lack a single high-level interface for architectural context, caller/impact analysis, and fallback orchestration across those lower layers, so `supi-code-intelligence` is needed to turn raw semantics and structure into actionable guidance.

## What Changes

- Add a new `supi-code-intelligence` workspace package as the main agent-facing code understanding extension for SuPi
- Register a `code_intel` tool with high-level actions: `brief`, `callers`, `implementations`, `affected`, and `pattern`
- Inject a lightweight architecture/module overview once per session so agents start with structural context
- Synthesize results from `supi-lsp` and `supi-tree-sitter`, preferring LSP for semantic truth, using Tree-sitter for structural enrichment/fallback, and using text search as a last resort
- Extend `supi-lsp` with a shared session-scoped semantic service and `textDocument/implementation` support so `supi-code-intelligence` can reuse live LSP state without starting duplicate servers
- Treat `supi-tree-sitter` as a prerequisite change for structural enrichment and package wiring; this change assumes that package lands before implementation begins
- Consume shared project-root utilities from `supi-core` for architecture-model scanning once the `extract-project-root-utils` prerequisite lands
- Publish the extension through both install surfaces used by this repo: the workspace root manifest and the published `@mrclrchtr/supi` meta-package wrapper surface

## Capabilities

### New Capabilities
- `code-intelligence-brief`: Generate session-start architecture overviews and on-demand focused briefs for the repo or a specific path
- `code-intelligence-search`: Expose the `code_intel` tool actions for callers, implementations, and pattern search with structured summarized output
- `code-intelligence-affected`: Analyze the blast radius of changing a symbol, including direct references, downstream modules, and risk level

### Modified Capabilities
- `lsp-client`: expose a shared session-scoped LSP service for peer extensions and add implementation-provider support needed by `supi-code-intelligence`

## Impact

- **New package**: `packages/supi-code-intelligence/`
- **Modified package**: `supi-lsp` gains a shared session-scoped service acquisition API and `textDocument/implementation` client support for peer extensions
- **Prerequisite change**: `extract-project-root-utils` moves LSP-agnostic project/root scanning helpers into `supi-core` so architecture-model scanning does not duplicate or reach into `supi-lsp` internals
- **Prerequisite change**: `supi-tree-sitter` must land before `supi-code-intelligence` implementation begins so the workspace dependency resolves cleanly
- **Root manifest**: `package.json` pi manifest gains a `supi-code-intelligence` extension entry
- **Published meta-package**: `packages/supi/package.json` gains the package dependency and `pi.extensions` wrapper entry, plus a local wrapper file such as `packages/supi/code-intelligence.ts`
- **Dependencies**: `supi-code-intelligence` depends on `supi-lsp`, `supi-tree-sitter`, `supi-core`, and pi peer dependencies
- **Verification scripts**: root `package.json` `typecheck` script is updated to include `packages/supi-code-intelligence/tsconfig.json` and any new test tsconfig if one is added
- **Agent prompt**: session-start architecture context and `code_intel` tool guidance are added without changing the existing `lsp` or `tree_sitter` tool surfaces
