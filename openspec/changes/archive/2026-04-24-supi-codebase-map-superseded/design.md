## Context

The supi monorepo has 8 workspace packages, each a pi extension loaded directly as TypeScript. Agents working in any codebase — not just supi — currently lack structural understanding and must discover module boundaries and dependencies through repeated file reads and greps.

`supi-lsp` already contains generic project scanning utilities (`walkProject`, `findProjectRoot`, `dedupeTopmostRoots`, etc.) that detect project roots from marker files. These are LSP-agnostic and should be shared.

The new `supi-codebase-map` package provides two things: a session-start module-level map injected into the system prompt, and an on-demand `codebase_map` tool for deeper exploration.

## Goals / Non-Goals

**Goals:**
- Give agents immediate structural understanding of a codebase at session start
- Support multiple programming languages via regex-based import extraction
- Provide on-demand drill-down at module or file granularity
- Reuse and share root detection logic between supi-lsp and supi-codebase-map via supi-core
- Keep the session-start injection compact (~200-400 tokens)

**Non-Goals:**
- Full data flow or taint analysis
- tree-sitter or AST-level parsing (v1 uses regex)
- Token budget management / truncation (defer to later version)
- Runtime tracing or dynamic analysis
- Replacing or duplicating LSP functionality

## Decisions

### Decision 1: Two-phase approach — session-start prompt injection + on-demand tool

**Choice**: Split into a cheap session-start scan (module-level, system prompt) and a richer on-demand tool (file-level detail, conversation context).

**Rationale**: The agent needs the aerial view always available (system prompt) but only needs file-level detail when actively working in an area. This avoids flooding the system prompt with deep scans of large repos.

**Alternatives considered**:
- Full map in system prompt only: too expensive token-wise for large repos
- Tool only, no prompt injection: agent has to explicitly ask for context it should already have
- Full map as user-prompt injection: can scroll off in long conversations; lower attention weight than system prompt

### Decision 2: Regex-based import extraction for v1

**Choice**: Use per-language regex patterns to extract import/require/use statements from source files.

**Rationale**: Covers 80%+ of cases with ~30-50 lines per language. No build step, no native dependencies, runs synchronously, language-agnostic by design. Can be upgraded to a library or tree-sitter later.

**Alternatives considered**:
- tree-sitter: more accurate, but adds a native dependency and grammar management
- TypeScript compiler API: TS-only, heavy
- LSP `textDocument/imports`: protocol 3.18+, not widely supported yet

### Decision 3: Extract root detection from supi-lsp into supi-core

**Choice**: Move `walkProject`, `findProjectRoot`, `dedupeTopmostRoots`, `sortRootsBySpecificity`, `isWithin`, and related path utilities from `supi-lsp` to `supi-core`.

**Rationale**: Both supi-lsp and supi-codebase-map need project root detection. The logic (`scanner.ts` `walkProject`/`dedupeTopmostRoots`, `utils.ts` `findProjectRoot`, `manager-roots.ts` path helpers) is entirely LSP-agnostic — it's pure filesystem operations on marker files.

**Alternatives considered**:
- Duplicate in supi-codebase-map: violates DRY, drift risk
- Have supi-codebase-map depend on supi-lsp: wrong dependency direction, LSP is heavier than needed
- New shared package `supi-fs-utils`: over-engineering for 6 functions

### Decision 4: System prompt injection via promptGuidelines

**Choice**: Inject the module-level map via the `promptGuidelines` mechanism (system prompt).

**Rationale**: The codebase map is foundational structural knowledge — comparable to CLAUDE.md content. It should always be present and have high attention weight. The compact module-level format (~200-400 tokens) fits within system prompt budget.

**Alternatives considered**:
- `<extension-context>` user-role injection: can scroll off, lower attention weight
- Separate system message: pi extensions don't have that mechanism

### Decision 5: Optional LSP enrichment for deep mode

**Choice**: The on-demand tool optionally uses supi-lsp's LSP client (if available) to enrich file-level results with `documentSymbol` (public API surface) and `references` (callers).

**Rationale**: LSP gives accurate symbol info without custom parsers. Making it optional keeps the package usable in projects without LSP servers. supi-lsp becomes a peer dependency, not a required one.

**Alternatives considered**:
- Always use LSP: fails in projects without language servers
- Never use LSP: misses easy accuracy wins when servers are running
- Build custom symbol extraction: too much per-language work

## Risks / Trade-offs

- **[Regex accuracy]** Regex import extraction will miss dynamic imports, re-exports, and aliased paths. → Acceptable for v1; the map is directional guidance, not a compiler. Upgrade path to library/tree-sitter exists.

- **[Token cost on large repos]** Module-level maps for very large monorepos could exceed 400 tokens. → Deferred to token budget feature. For v1, emit the full map. Most repos are manageable.

- **[Scan time on session start]** Walking a large project tree and regex-scanning all source files could add latency. → The walk is bounded to depth 3 and skips `node_modules`/`.git`. Regex extraction is line-level and fast. Should be under 1 second for most repos.

- **[Extraction breaking supi-lsp]** Moving functions from supi-lsp to supi-core could break supi-lsp if imports aren't updated correctly. → Straightforward refactor: move functions, re-export from supi-core, update supi-lsp imports. Tests in supi-lsp will catch regressions.

- **[Marker breadth vs noise]** Using a broader marker set than LSP could detect "modules" that aren't meaningful (e.g., a `package.json` in a test fixture). → Acceptable noise for v1. Can add exclusion patterns later.
