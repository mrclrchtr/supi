## Context

SuPi is converging on a layered code-understanding stack:
- `supi-lsp` for live language-server semantics
- `supi-tree-sitter` for parser/AST-backed structure
- `supi-code-intelligence` as the single agent-facing product that turns those lower-level capabilities into architectural guidance and actionable analysis

The older `supi-code-intel` and `supi-codebase-map` ideas identified the right user pain but split the solution along overlapping product boundaries. This change reframes that work into one higher-level extension that owns the agent experience while depending on the two implementation-shaped substrates below it.

The package must work across both repo install surfaces:
1. the workspace root pi manifest used for local development
2. the published `@mrclrchtr/supi` meta-package, which exposes wrapper entrypoints

It also depends on lower-layer readiness:
- `supi-tree-sitter` is a prerequisite change and must land before this package can take a hard workspace dependency on it
- `extract-project-root-utils` is a prerequisite change so architecture-model scanning can use shared `supi-core` project/root utilities instead of duplicating logic or importing `supi-lsp` internals
- `supi-lsp` currently owns its `LspManager` privately, so this change must first expose a shared session-scoped semantic service rather than assuming one already exists

It also has to respect existing repo constraints:
- pi loads extensions directly from TypeScript source
- prompt/tool contracts should stay compact
- lower-level extensions should remain usable independently and should not compete on prompt injection or high-level UX

## Goals / Non-Goals

**Goals:**
- Provide the main agent-facing code understanding extension for SuPi
- Register a single `code_intel` tool that exposes high-level actions: `brief`, `callers`, `implementations`, `affected`, and `pattern`
- Inject a compact architecture overview once per session so agents start with structural context
- Synthesize `supi-lsp`, `supi-tree-sitter`, and text search results behind one stable interface
- Publish the extension through both workspace and meta-package install surfaces
- Ensure root verification scripts actually typecheck and validate the new package

**Non-Goals:**
- Replacing raw `lsp` or `tree_sitter` tools
- Preserving a separate `codebase_map` tool; `code_intel brief` is the high-level replacement
- Reintroducing broad regex-first import/export extraction for Python, Rust, Go, Ruby, Java, or other languages in v1
- Moving prompt injection responsibilities down into `supi-lsp` or `supi-tree-sitter`
- Building a persistent index, file watcher, or background cache in v1
- Guaranteeing fully semantic fallback behavior when LSP is absent
- Modifying existing `supi-lsp` or `supi-tree-sitter` tool contracts

## Decisions

### 1. One agent-facing package and one high-level tool

**Decision:** Create `supi-code-intelligence` as the single agent-facing package and register one `code_intel` tool with action-based routing.

**Rationale:** This keeps the user story clear: technical layers stay technical, while the code-understanding experience has one obvious home. A single tool keeps prompt surface smaller than multiple specialized tools and matches the repo's existing action-oriented tool style.

**Alternatives considered:**
- Keep `supi-code-intel` and `supi-codebase-map` as separate peers — too much overlap and unclear ownership
- Create multiple tools (`code_brief`, `code_affected`, `code_search`) — more prompt overhead and weaker discoverability
- Expose a generic query language — too open-ended for consistent agent use

### 2. Compose lower-level services directly, not through tool calls

**Decision:** `supi-code-intelligence` SHALL depend directly on reusable APIs from `supi-lsp` and `supi-tree-sitter` rather than calling their registered tools as an intermediary.

**Rationale:** Direct composition preserves structure, typing, and richer result data. Using tool calls internally would introduce formatting/parse overhead, weaken testability, and make fallback orchestration harder.

**Required prerequisite work:**
- `supi-lsp` must expose a shared session-scoped service acquisition API so peer extensions can reuse the already initialized LSP runtime and avoid spawning duplicate server sets
- `supi-lsp` must add `textDocument/implementation` client support so `supi-code-intelligence` can provide true semantic implementation results when servers support it
- `supi-tree-sitter` must land first so `supi-code-intelligence` can depend on its reusable structural services

**Composition model:**
- `supi-lsp` provides semantic truth where available: references, symbols, definitions, implementations, diagnostics-aware project context
- `supi-tree-sitter` provides structural extraction: outlines, imports/exports, local syntax context, and parser-backed file understanding
- `ripgrep` provides the broadest fallback for text pattern search and degraded hinting when semantic tools are unavailable

**Alternatives considered:**
- Call the `lsp` and `tree_sitter` tools from inside `code_intel` — simpler conceptually, but creates stringly typed coupling and output re-parsing
- Give `supi-code-intelligence` its own LSP lifecycle — avoids shared-service work, but would duplicate server startup and fragment semantic state across extensions
- Reimplement semantic or structural analysis locally — duplicates logic and undermines the layered architecture

### 3. Overview injection happens on the first `before_agent_start`

**Decision:** Generate and inject the architecture overview on the first `before_agent_start` event of a session, not on every turn and not in `session_start`.

**Rationale:** This timing allows `supi-lsp` to finish its own initialization while still providing the context before the agent responds for the first time. Injecting once keeps token cost bounded and reinforces the rule that only `supi-code-intelligence` owns high-level architecture context.

**Alternatives considered:**
- `session_start` injection — may run before LSP-backed enrichment is ready
- Inject on every `before_agent_start` — repetitive and token-expensive
- No automatic injection — forces the agent to ask for context it should already have

### 4. Build a shared architecture model from manifests first, then enrich

**Decision:** Generate briefs and overviews from a shared architecture model built from project metadata and structural scans, then enrich with LSP and Tree-sitter data.

**Base inputs:**
- `package.json` and similar project metadata for package names, descriptions, entrypoints, and dependency edges
- shared `supi-core` project/root utilities for module boundary discovery and focus-path resolution
- directory/module layout for top-level structure
- Tree-sitter-derived imports/exports/outlines for structural shape
- LSP symbols/references/implementations when semantic support is available

**Rationale:** The overview must still be useful when LSP is partial or absent. A model that starts with manifests and structural data ensures `brief` can degrade gracefully, while LSP can add higher-confidence semantic detail when present.

**Alternatives considered:**
- LSP-only brief generation — strong semantics, but brittle when servers are unavailable or incomplete
- Tree-sitter-only brief generation — good structure, but too weak for semantic relationship analysis
- Regex-only scanning — useful historically, but less aligned with the new layered architecture

### 5. Fallback policy is explicit and action-specific

**Decision:** `code_intel` SHALL use explicit fallback order and label degraded results clearly.

**Fallback order:**
1. LSP first for semantic truth
2. Tree-sitter second for structural enrichment and limited heuristic recovery
3. text search last for broad fallback

**Action behavior:**
- `brief` works from the shared architecture model and is enriched by LSP/Tree-sitter when available
- `callers`, `implementations`, and `affected` prefer LSP and may return heuristic, clearly-labeled degraded output when only structural/text fallbacks are available
- `pattern` is a direct text-search action and does not depend on LSP or Tree-sitter

**Rationale:** Different actions need different confidence levels. This policy preserves a stable tool surface while being honest about precision.

**Alternatives considered:**
- Hard-fail all semantic actions without LSP — precise, but too limiting for real use
- Silent heuristic fallback — risks agents mistaking best-effort hints for semantic truth

### 6. Semantic actions must resolve a concrete target before analysis

**Decision:** Semantic actions (`callers`, `implementations`, `affected`) SHALL accept either an explicit anchored target (`file`, `line`, `character`) or a discovery input such as `symbol`. If discovery input resolves to multiple plausible targets, the tool returns a disambiguation result instead of silently merging or picking one.

**Rationale:** LSP reference and implementation APIs are position-based, and symbol names are frequently duplicated across files. Requiring a concrete target or an explicit disambiguation round keeps semantic results trustworthy.

**Alternatives considered:**
- Accept only bare symbol names — convenient, but too ambiguous for reliable semantic analysis
- Silently pick the first match — simple to implement, but produces untrustworthy caller and impact reports
- Require anchored positions for every request — precise, but less usable for discovery-oriented workflows

### 7. Use structured markdown output with bounded overview size

**Decision:** All `code_intel` output SHALL be structured markdown with summaries, grouped sections, and file/path references. Auto-injected overview content SHALL target a compact budget rather than dumping full API detail.

**Rationale:** The agent consumes markdown naturally, and grouped summaries improve triage. Bounded overview output preserves prompt budget while keeping richer detail available through on-demand `brief`. A dense module-edge format such as `supi-lsp → supi-core` should be preferred over verbose per-module prose in the auto-injected overview.

**Alternatives considered:**
- JSON-first output — better for machines, less ergonomic in the agent context
- Verbose prompt injection — easier to generate, but too expensive and distracting

### 8. Match repository packaging and verification surfaces explicitly

**Decision:** The change includes both publish surfaces and root verification scripts as first-class implementation work.

**Required wiring:**
- root `package.json` `pi.extensions`
- `packages/supi/package.json` dependency and wrapper entrypoint
- root `typecheck` update for `packages/supi-code-intelligence/tsconfig.json`
- `typecheck:tests` update if package-specific test tsconfig is added

**Rationale:** This repo does not discover packages automatically for publishing or typechecking. If these surfaces are omitted, the extension can appear implemented locally while being absent from the published meta-package or skipped by `pnpm verify`.

## Risks / Trade-offs

- **[Coupling to lower-layer internals]** → Directly depending on `supi-lsp` and `supi-tree-sitter` service APIs creates workspace coupling. **Mitigation:** keep their reusable APIs explicit and update the stack in sync within the monorepo.
- **[Blocked prerequisite]** → `supi-code-intelligence` cannot install cleanly until `supi-tree-sitter` exists as a workspace package. **Mitigation:** treat `supi-tree-sitter` as a prerequisite change and sequence implementation after it lands.
- **[Heuristic fallbacks can be misleading]** → Degraded `callers`/`implementations`/`affected` results may look more authoritative than they are. **Mitigation:** label non-LSP results clearly as heuristic and separate them from semantic truth sections.
- **[Overview token cost]** → Session-start architecture context can crowd the prompt. **Mitigation:** inject only once per session and keep the overview compact, with deeper detail only via `brief`.
- **[Startup latency]** → Building the first architecture model may add noticeable delay. **Mitigation:** start from cheap metadata scans, enrich opportunistically, and avoid project-wide deep analysis in the auto-injected path.
- **[Responsibility creep]** → The package may accumulate low-level features that belong in `supi-tree-sitter` or `supi-lsp`. **Mitigation:** keep raw parser/server operations in the substrate packages and limit `supi-code-intelligence` to synthesis and high-level UX.

## Superseded Changes

This change supersedes the earlier `supi-code-intel` and `supi-codebase-map` directions. The `code_intel` tool and its `brief`, `callers`, `implementations`, `affected`, and `pattern` actions replace `supi-code-intel`. `code_intel brief` replaces the separate `codebase_map` tool, while `supi-tree-sitter` replaces regex-first structural extraction for supported JS/TS-family files. Broad multi-language regex extraction and the standalone `codebase_map` API are intentionally deferred rather than accidentally omitted.

One piece from `supi-codebase-map` remains valuable as independent shared infrastructure: extracting LSP-agnostic project/root utilities from `supi-lsp` into `supi-core`. That work is tracked as the `extract-project-root-utils` prerequisite change and should land before `supi-code-intelligence` builds its architecture model.

## Migration Plan

- Land `extract-project-root-utils` so shared project/root scanning helpers are available from `supi-core`
- Land `supi-tree-sitter` first so the workspace dependency is available
- Extend `supi-lsp` with shared session-scoped service acquisition and `textDocument/implementation` support
- Add `packages/supi-code-intelligence/` as a new standalone workspace package
- Wire it into the workspace root pi manifest and the published `@mrclrchtr/supi` meta-package wrapper surface
- Update root verification scripts so `pnpm verify` covers the new package
- Keep existing lower-level packages unchanged from a user-facing tool-contract perspective; `supi-code-intelligence` composes them without altering the existing `lsp` or `tree_sitter` action surfaces
