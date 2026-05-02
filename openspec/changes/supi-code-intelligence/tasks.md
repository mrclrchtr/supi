## 1. Confirm landed prerequisites and public substrate contracts

- [x] 1.1 Verify `extract-project-root-utils` has landed and `@mrclrchtr/supi-core` exports shared project/root helpers
- [x] 1.2 Verify `supi-tree-sitter` has landed as `@mrclrchtr/supi-tree-sitter` with a package-root service API
- [x] 1.3 Verify `supi-lsp` exposes `getSessionLspService()` / `SessionLspService` from the package root
- [x] 1.4 Verify reusable `supi-lsp` implementation-provider support exists for `SessionLspService.implementation()`
- [x] 1.5 Verify existing substrate tests cover shared LSP service reuse, implementation-provider behavior, and Tree-sitter service exports

## 2. Package scaffolding and wiring

- [ ] 2.1 Create `packages/supi-code-intelligence/` with `package.json`, `tsconfig.json`, README, and workspace metadata following existing package patterns
- [ ] 2.2 Add dependencies on `@mrclrchtr/supi-lsp`, `@mrclrchtr/supi-tree-sitter`, and `@mrclrchtr/supi-core`, plus required pi peer dependencies
- [ ] 2.3 Add `supi-code-intelligence` to the root `package.json` `pi.extensions` array
- [ ] 2.4 Add the package to `packages/supi/package.json`, create a wrapper entrypoint such as `packages/supi/code-intelligence.ts`, and register it in the meta-package `pi.extensions` list
- [ ] 2.5 Run `pnpm install` to refresh workspace links and lockfile entries

## 3. Shared architecture model

- [ ] 3.1 Implement project metadata scanning for package/module names, descriptions, entrypoints, and dependency edges using shared `supi-core` project/root utilities
- [ ] 3.2 Implement module-boundary and focus-path resolution for project, module/directory, and single-file analysis
- [ ] 3.3 Implement dependency graph extraction that distinguishes internal module edges, reverse dependencies/dependents, and external package dependencies where available
- [ ] 3.4 Implement structural enrichment using `createTreeSitterSession()` for outlines, imports, exports, and node context when supported
- [ ] 3.5 Implement semantic enrichment using `getSessionLspService(ctx.cwd)` for document symbols, workspace symbols, references, implementations, and diagnostics when available
- [ ] 3.6 Implement a shared architecture model that can power both the auto-injected overview and on-demand `brief` output
- [ ] 3.7 Handle empty or source-only projects without producing noisy empty architecture sections
- [ ] 3.8 Dispose or reuse Tree-sitter sessions deliberately so repeated briefs do not leak parser resources

## 4. Brief generation and session context

- [ ] 4.1 Implement compact overview formatting for first-turn session injection, targeting roughly 500 tokens or less
- [ ] 4.2 Support dense module-edge formatting for overview output, including leaf/module dependency annotations where useful
- [ ] 4.3 Implement full-project `brief` generation from the shared architecture model
- [ ] 4.4 Implement focused `brief` generation for a specific file or directory path, including missing-path errors
- [ ] 4.5 Ensure focused briefs include dependencies, dependents/reverse dependencies, and internal versus external edges when available
- [ ] 4.6 Include a short “best next queries” hint in full and focused briefs so agents know when to ask for `affected`, `callers`, or a narrower `brief`
- [ ] 4.7 Wire a first-turn-only `before_agent_start` handler that injects the overview once per session
- [ ] 4.8 Register a compact custom-message renderer or suppress noisy display if needed so injected overview context remains readable in the TUI

## 5. Search and affected actions

- [ ] 5.1 Implement target resolution for semantic actions using either anchored positions (`file`, `line`, `character`) or symbol discovery with explicit disambiguation results
- [ ] 5.2 Implement `callers` using LSP-first semantic results with grouped summaries and clearly labeled heuristic fallback output
- [ ] 5.3 Implement `implementations` using `SessionLspService.implementation()` when available, with clearly labeled heuristic candidates or unavailable messaging when needed
- [ ] 5.4 Implement `pattern` using structured text search with grouped matches and context lines
- [ ] 5.5 Implement `affected` with direct references, downstream dependents, qualitative risk assessment, and ambiguity-safe target handling
- [ ] 5.6 Add shared output truncation using pi output limits and confidence labeling for semantic, structural, and text-search results
- [ ] 5.7 Add optional `maxResults` / `contextLines` style controls with safe defaults so agents can intentionally trade detail for tokens

## 6. Tool integration and agent guidance

- [ ] 6.1 Create the `code_intel` extension entry point and register the tool with `brief`, `callers`, `implementations`, `affected`, and `pattern` actions
- [ ] 6.2 Add action-specific parameter validation and error messages for required inputs such as `symbol`, `file`, `line`, `character`, `path`, and search pattern
- [ ] 6.3 Route tool actions through shared architecture/search services rather than duplicating logic in the entrypoint
- [ ] 6.4 Add `promptSnippet` and `promptGuidelines` that explicitly name `code_intel`, explain when it beats `read`/`rg`, and position `lsp` / `tree_sitter` as drill-down tools rather than competitors
- [ ] 6.5 Ensure prompt guidance is compact but motivating: orientation before unfamiliar edits, `affected` before API/refactor changes, `callers`/`implementations` for semantic relationships, and `pattern` for bounded text search
- [ ] 6.6 Include action examples in tool descriptions or schema descriptions without bloating the system prompt

## 7. Tests and verification

- [ ] 7.1 Add unit tests for the shared architecture model, overview formatting, empty-project handling, and focused brief generation
- [ ] 7.2 Add unit tests for dependency/reverse-dependency reporting and internal versus external edge labeling
- [ ] 7.3 Add unit tests for target resolution, `callers`, `implementations`, `pattern`, and `affected`, including ambiguity handling and degraded fallback labeling
- [ ] 7.4 Add integration tests for `code_intel` tool registration, validation, prompt guidance, and first-turn-only overview injection
- [ ] 7.5 Verify the root `typecheck` and `typecheck:tests` glob scripts discover the new package and test tsconfig automatically
- [ ] 7.6 Run `pnpm exec biome check --write packages/supi-code-intelligence/`
- [ ] 7.7 Run targeted package typecheck/test commands for `supi-code-intelligence` and affected substrate consumers
- [ ] 7.8 Run `pnpm typecheck`, `pnpm test`, and `pnpm verify`
- [ ] 7.9 Manual test: load pi in the supi repo, verify `code_intel` appears, review prompt guidance, and exercise each action
