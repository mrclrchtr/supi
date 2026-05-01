## 1. Prerequisites and lower-layer coordination

- [ ] 1.1 Land `extract-project-root-utils` so shared project/root scanning helpers are available from `@mrclrchtr/supi-core`
- [ ] 1.2 Land `supi-tree-sitter` first so `@mrclrchtr/supi-tree-sitter` exists as a workspace dependency before scaffolding this package
- [ ] 1.3 Extend `supi-lsp` with a shared session-scoped service acquisition API so peer extensions can reuse one initialized LSP runtime
- [ ] 1.4 Add `textDocument/implementation` support and unsupported-provider handling to the reusable `supi-lsp` client layer
- [ ] 1.5 Add or update tests in `supi-lsp` covering shared service reuse and implementation-provider support

## 2. Package scaffolding and wiring

- [ ] 2.1 Create `packages/supi-code-intelligence/` with `package.json`, `tsconfig.json`, and workspace metadata following existing package patterns
- [ ] 2.2 Add dependencies on `@mrclrchtr/supi-lsp`, `@mrclrchtr/supi-tree-sitter`, and `@mrclrchtr/supi-core`, plus required pi peer dependencies
- [ ] 2.3 Add `supi-code-intelligence` to the root `package.json` `pi.extensions` array
- [ ] 2.4 Add the package to `packages/supi/package.json`, create a wrapper entrypoint such as `packages/supi/code-intelligence.ts`, and register it in the meta-package `pi.extensions` list
- [ ] 2.5 Run `pnpm install` to refresh workspace links and lockfile entries

## 3. Shared architecture model

- [ ] 3.1 Implement project metadata scanning for package/module names, descriptions, entrypoints, and dependency edges using shared `supi-core` project/root utilities
- [ ] 3.2 Implement module-boundary and focus-path resolution for project, module/directory, and single-file analysis
- [ ] 3.3 Implement dependency graph extraction that distinguishes internal module edges, reverse dependencies/dependents, and external package dependencies where available
- [ ] 3.4 Implement structural enrichment using `supi-tree-sitter` services for outlines, imports, and exports when supported
- [ ] 3.5 Implement semantic enrichment using the shared `supi-lsp` service for symbols, references, and implementations when available
- [ ] 3.6 Implement a shared architecture model that can power both the auto-injected overview and on-demand `brief` output
- [ ] 3.7 Handle empty or source-only projects without producing noisy empty architecture sections

## 4. Brief generation and session context

- [ ] 4.1 Implement compact overview formatting for first-turn session injection, targeting roughly 500 tokens or less
- [ ] 4.2 Support dense module-edge formatting for overview output, including leaf/module dependency annotations where useful
- [ ] 4.3 Implement full-project `brief` generation from the shared architecture model
- [ ] 4.4 Implement focused `brief` generation for a specific file or directory path, including missing-path errors
- [ ] 4.5 Ensure focused briefs include dependencies, dependents/reverse dependencies, and internal versus external edges when available
- [ ] 4.6 Wire a first-turn-only `before_agent_start` handler that injects the overview once per session

## 5. Search and affected actions

- [ ] 5.1 Implement target resolution for semantic actions using either anchored positions (`file`, `line`, `character`) or symbol discovery with explicit disambiguation results
- [ ] 5.2 Implement `callers` using LSP-first semantic results with grouped summaries and clearly labeled heuristic fallback output
- [ ] 5.3 Implement `implementations` using LSP implementation-provider support when available, with clearly labeled heuristic candidates or unavailable messaging when needed
- [ ] 5.4 Implement `pattern` using structured text search with grouped matches and context lines
- [ ] 5.5 Implement `affected` with direct references, downstream dependents, qualitative risk assessment, and ambiguity-safe target handling
- [ ] 5.6 Add shared output truncation using pi output limits and confidence labeling for semantic versus heuristic results

## 6. Tool integration

- [ ] 6.1 Create the `code_intel` extension entry point and register the tool with `brief`, `callers`, `implementations`, `affected`, and `pattern` actions
- [ ] 6.2 Add action-specific parameter validation and error messages for required inputs such as `symbol`, `file`, `line`, `character`, `path`, and search pattern
- [ ] 6.3 Route tool actions through shared architecture/search services rather than duplicating logic in the entrypoint
- [ ] 6.4 Add prompt guidance describing when `code_intel` complements `lsp` and `tree_sitter` rather than replacing them

## 7. Tests and verification

- [ ] 7.1 Add unit tests for the shared architecture model, overview formatting, empty-project handling, and focused brief generation
- [ ] 7.2 Add unit tests for dependency/reverse-dependency reporting and internal versus external edge labeling
- [ ] 7.3 Add unit tests for target resolution, `callers`, `implementations`, `pattern`, and `affected`, including ambiguity handling and degraded fallback labeling
- [ ] 7.4 Add integration tests for `code_intel` tool registration, validation, and first-turn-only overview injection
- [ ] 7.5 Update the root `package.json` `typecheck` script to include `packages/supi-code-intelligence/tsconfig.json`, and update `typecheck:tests` as needed if the new tests get their own tsconfig
- [ ] 7.6 Run `pnpm exec biome check --write packages/supi-code-intelligence/`
- [ ] 7.7 Run `pnpm typecheck`, `pnpm test`, and `pnpm verify`
- [ ] 7.8 Manual test: load pi in the supi repo, verify `code_intel` appears, and exercise each action
