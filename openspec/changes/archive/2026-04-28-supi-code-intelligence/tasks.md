## 1. Confirm landed prerequisites and public substrate contracts

- [x] 1.1 Verify `extract-project-root-utils` has landed and `@mrclrchtr/supi-core` exports shared project/root helpers
- [x] 1.2 Verify `supi-tree-sitter` has landed as `@mrclrchtr/supi-tree-sitter` with a package-root service API
- [x] 1.3 Verify `supi-lsp` exposes `getSessionLspService()` / `SessionLspService` from the package root
- [x] 1.4 Verify reusable `supi-lsp` implementation-provider support exists for `SessionLspService.implementation()`
- [x] 1.5 Verify existing substrate tests cover shared LSP service reuse, implementation-provider behavior, and Tree-sitter service exports

## 2. Package scaffolding and wiring

- [x] 2.1 Create `packages/supi-code-intelligence/` with `package.json`, `tsconfig.json`, README, and workspace metadata following existing package patterns
- [x] 2.2 Add dependencies on `@mrclrchtr/supi-lsp`, `@mrclrchtr/supi-tree-sitter`, and `@mrclrchtr/supi-core`, plus required pi peer dependencies
- [x] 2.3 Add `supi-code-intelligence` to the root `package.json` `pi.extensions` array after `supi-lsp` and `supi-tree-sitter`
- [x] 2.4 Add the package to `packages/supi/package.json`, create a wrapper entrypoint such as `packages/supi/code-intelligence.ts`, and register it in the meta-package `pi.extensions` list after the lower-layer wrappers
- [x] 2.5 Run `pnpm install` to refresh workspace links and lockfile entries

## 3. Shared architecture model

- [x] 3.1 Implement project metadata scanning for package/module names, descriptions, entrypoints, and dependency edges using shared `supi-core` project/root utilities
- [x] 3.2 Detect notable public/exported API surfaces and config/settings entrypoints cheaply enough for briefs and overview summaries
- [x] 3.3 Implement module-boundary and focus-path resolution for project, module/directory, and single-file analysis
- [x] 3.4 Implement dependency graph extraction that distinguishes internal module edges, reverse dependencies/dependents, and external package dependencies where available
- [x] 3.5 Implement structural enrichment using `createTreeSitterSession()` for outlines, imports, exports, and node context when supported
- [x] 3.6 Implement semantic enrichment using `getSessionLspService(ctx.cwd)` for document symbols, workspace symbols, references, implementations, and diagnostics when available
- [x] 3.7 Implement a shared architecture model that can power both the auto-injected overview and on-demand `brief` output
- [x] 3.8 Handle empty or source-only projects without producing noisy empty architecture sections
- [x] 3.9 Dispose or reuse Tree-sitter sessions deliberately so repeated briefs do not leak parser resources

## 4. Brief generation and session context

- [x] 4.1 Implement compact overview formatting for first-turn session injection, targeting roughly 500 tokens or less and a predictable small module/edge budget
- [x] 4.2 Support dense module-edge formatting for overview output, including leaf/module dependency annotations where useful
- [x] 4.3 Implement full-project `brief` generation from the shared architecture model
- [x] 4.4 Highlight notable entrypoints, top public/exported API surfaces, and config/settings surfaces in project and module briefs without dumping full export lists
- [x] 4.5 Implement focused `brief` generation for a specific file or directory path, including missing-path errors
- [x] 4.6 Implement anchored `brief` generation for `file` + 1-based `line` + `character`, returning enclosing-symbol or enclosing-node context when available
- [x] 4.7 Ensure focused briefs include dependencies, dependents/reverse dependencies, and internal versus external edges when available
- [x] 4.8 Include a bounded "start here" section and at most two short "best next queries" hints in full and focused briefs so agents know what to inspect or ask next
- [x] 4.9 Wire a first-turn-only `before_agent_start` handler that injects the overview once per session and does not duplicate after `/reload` or session resume
- [x] 4.10 Keep first-turn overview generation latency-bounded by using cheap metadata and readily available structural data first and deferring deep enrichment to on-demand `brief`
- [x] 4.11 Return structured `details` metadata for `brief` results (confidence, focus target, start-here targets, public surfaces, dependency summary, omitted counts, next queries)
- [x] 4.12 Register a compact custom-message renderer or suppress noisy display if needed so injected overview context remains readable in the TUI

## 5. Search and affected actions

- [x] 5.1 Implement target resolution for semantic actions using either anchored 1-based positions (`file`, `line`, `character`) or symbol discovery with ranked, retry-ready disambiguation results (name, kind, container, rank, coordinates, reason), including omitted counts when candidates are truncated, translating public coordinates to the 0-based LSP service API internally
- [x] 5.2 Add optional narrowing filters for discovery-oriented semantic actions such as `path`, symbol `kind`, and canonical v1 `exportedOnly`
- [x] 5.3 Implement `callers` using LSP-first semantic results with grouped summaries, ranked top targets, and clearly labeled heuristic fallback output
- [x] 5.4 Implement best-effort v1 `callees` using semantic relationship data when available and Tree-sitter or text-search heuristics otherwise, with clearly labeled degraded fallback output
- [x] 5.5 Implement `implementations` using `SessionLspService.implementation()` when available, with clearly labeled heuristic candidates or unavailable messaging when needed
- [x] 5.6 Implement `pattern` using structured text search with grouped matches, context lines, `path` scoping, and applied-scope summaries
- [x] 5.7 Implement `affected` with direct references, downstream dependents, explained `low` / `medium` / `high` risk assessment, highest-value "check next" files/modules, likely tests to inspect, prompt partial fallback behavior, and ambiguity-safe target handling
- [x] 5.8 Add shared output truncation using pi output limits, explicit confidence/capability labeling, anti-noise output rules, and next-best-step messaging for semantic, structural, and text-search results
- [x] 5.9 Add optional `maxResults` / `contextLines` style controls with concrete token-efficient defaults so agents can intentionally trade detail for tokens
- [x] 5.10 Return structured `details` metadata for relationship and pattern results (confidence, scope, candidates, omitted counts, next queries)

## 6. Tool integration and agent guidance

- [x] 6.1 Create the `code_intel` extension entry point and register the tool with `brief`, `callers`, `callees`, `implementations`, `affected`, and `pattern` actions
- [x] 6.2 Add action-specific parameter validation and error messages for required inputs such as `symbol`, `file`, `line`, `character`, `path`, search pattern, and optional narrowing filters such as `kind` and canonical v1 `exportedOnly`, including path-vs-file role mistakes and leading-`@` normalization
- [x] 6.3 Route tool actions through shared architecture/search services rather than duplicating logic in the entrypoint
- [x] 6.4 Add `promptSnippet` and `promptGuidelines` that explicitly name `code_intel`, explain when it beats `read`/`rg`, map plain-language intents to canonical actions, and deconflict active `lsp` / `tree_sitter` guidance by positioning them as drill-down tools rather than competitors
- [x] 6.5 Ensure prompt guidance is compact but motivating: orientation before unfamiliar edits, `affected` before API/refactor changes, `callers`/`callees`/`implementations` for semantic relationships, and `pattern` for bounded text search
- [x] 6.6 Include 6-10 minimal flat-schema action examples in tool descriptions or schema descriptions without bloating the system prompt, covering `brief`, anchored `brief`, `callers`, `callees`, `implementations`, `affected`, and `pattern`

## 7. Tests and verification

_Tier 1 tasks are required for initial merge. Tier 2 tasks are required before v1 release but may land as follow-up hardening._

- [x] 7.1 [Tier 1] Add unit tests for the shared architecture model, overview formatting, empty-project handling, focused path brief generation, anchored enclosing-symbol brief generation, and entrypoint/public-surface highlighting
- [x] 7.2 [Tier 2] Add unit tests for dependency/reverse-dependency reporting and internal versus external edge labeling
- [x] 7.3 [Tier 1] Add unit tests for target resolution, coordinate translation, rich ranked disambiguation, flat-schema parameter roles (`path` vs `file`), leading-`@` normalization, narrowing filters, `callers`, `callees`, `implementations`, path-scoped `pattern`, and `affected`, including ambiguity handling, omitted counts, and degraded fallback labeling
- [x] 7.4 [Tier 2] Add unit tests for ranked top-target summaries and bounded "start here" sections in `brief`, structured `details` metadata across `brief`, relationship, and affected outputs, and likely-test suggestions plus discrete risk levels in `affected` outputs
- [x] 7.5 [Tier 1] Add integration tests for `code_intel` tool registration, validation, example-call help text, prompt guidance deconfliction, and first-turn-only overview injection across reload/resume
- [x] 7.6 [Tier 1] Verify the root `typecheck` and `typecheck:tests` glob scripts discover the new package and test tsconfig automatically
- [x] 7.7 [Tier 1] Run `pnpm exec biome check --write packages/supi-code-intelligence/`
- [x] 7.8 [Tier 1] Run targeted package typecheck/test commands for `supi-code-intelligence` and affected substrate consumers
- [x] 7.9 [Tier 1] Run `pnpm typecheck`, `pnpm test`, and `pnpm verify`
- [ ] 7.10 [Tier 2] Manual test: load pi in the supi repo, verify `code_intel` appears, review prompt guidance, and exercise each action
