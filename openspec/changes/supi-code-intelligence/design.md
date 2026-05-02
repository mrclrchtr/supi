## Context

SuPi is converging on a layered code-understanding stack:
- `supi-lsp` for live language-server semantics
- `supi-tree-sitter` for parser/AST-backed structure
- `supi-code-intelligence` as the single agent-facing product that turns those lower-level capabilities into architectural guidance and actionable analysis

The older `supi-code-intel` and `supi-codebase-map` ideas identified the right user pain but split the solution along overlapping product boundaries. This change reframes that work into one higher-level extension that owns the agent experience while depending on the two implementation-shaped substrates below it.

The package must work across both repo install surfaces:
1. the workspace root pi manifest used for local development
2. the published `@mrclrchtr/supi` meta-package, which exposes wrapper entrypoints

The lower-layer readiness work has now landed in separate changes:
- `supi-tree-sitter` exists as a workspace package and exports `createTreeSitterSession(cwd)` plus structural result types from the package root
- `extract-project-root-utils` moved LSP-agnostic project/root helpers into `supi-core`
- `supi-lsp` exports `getSessionLspService(cwd)` and a `SessionLspService` wrapper from the package root, including `implementation()` support

This change should consume those public package-root APIs rather than reopen their already-archived substrate specs.

It also has to respect existing repo constraints:
- pi loads extensions directly from TypeScript source
- prompt/tool contracts should stay compact
- lower-level extensions should remain usable independently and should not compete on prompt injection or high-level UX

## Goals / Non-Goals

**Goals:**
- Provide the main agent-facing code understanding extension for SuPi
- Register a single `code_intel` tool that exposes high-level actions: `brief`, `callers`, `callees`, `implementations`, `affected`, and `pattern`
- Inject a compact architecture overview once per session so agents start with structural context
- Synthesize `supi-lsp`, `supi-tree-sitter`, and text search results behind one stable interface
- Make the tool ergonomics good enough that agents naturally choose `code_intel` before broad file reads or ad-hoc `rg` when they need architecture, relationships, or impact
- Keep common calls short while making follow-up calls copyable: disambiguation and next-query hints should include exact `file`, 1-based `line`, 1-based `character`, `path`, or `pattern` values when known
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

**Initial action set:** `brief`, `callers`, `callees`, `implementations`, `affected`, and `pattern`.

**Rationale:** This keeps the user story clear: technical layers stay technical, while the code-understanding experience has one obvious home. A single tool keeps prompt surface smaller than multiple specialized tools and matches the repo's existing action-oriented tool style.

**Alternatives considered:**
- Keep `supi-code-intel` and `supi-codebase-map` as separate peers — too much overlap and unclear ownership
- Create multiple tools (`code_brief`, `code_affected`, `code_search`) — more prompt overhead and weaker discoverability
- Expose a generic query language — too open-ended for consistent agent use

### 2. Compose lower-level services directly, not through tool calls

**Decision:** `supi-code-intelligence` SHALL depend directly on reusable APIs from `supi-lsp` and `supi-tree-sitter` rather than calling their registered tools as an intermediary.

**Rationale:** Direct composition preserves structure, typing, and richer result data. Using tool calls internally would introduce formatting/parse overhead, weaken testability, and make fallback orchestration harder.

**Available substrate contract:**
- `@mrclrchtr/supi-lsp` package root exports `getSessionLspService(cwd)`, `SessionLspService`, `SessionLspServiceState`, and public LSP result types
- `SessionLspServiceState` can be `ready`, `pending`, `disabled`, or `unavailable`; `supi-code-intelligence` must branch on those states and never start its own LSP lifecycle
- `SessionLspService` provides semantic truth where available: hover, definitions, references, workspace symbols, document symbols, implementations, project server info, supported-file checks, and diagnostics
- `@mrclrchtr/supi-tree-sitter` package root exports `createTreeSitterSession(cwd)` plus structural result types; `supi-code-intelligence` owns disposing sessions it creates
- `supi-core` provides reusable project/root helpers for walking roots, resolving known roots, and path containment checks

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
- LSP symbols/references/implementations when semantic support is available, plus callee relationship data from semantic or structural sources where available
- notable package entrypoints and public/exported API surfaces when they can be inferred cheaply from metadata, manifests, and structural/semantic analysis

**Rationale:** The overview must still be useful when LSP is partial or absent. A model that starts with manifests and structural data ensures `brief` can degrade gracefully, while LSP can add higher-confidence semantic detail when present.

**Alternatives considered:**
- LSP-only brief generation — strong semantics, but brittle when servers are unavailable or incomplete
- Tree-sitter-only brief generation — good structure, but too weak for semantic relationship analysis
- Regex-only scanning — useful historically, but less aligned with the new layered architecture

### 5. Fallback policy is explicit and action-specific

**Decision:** `code_intel` SHALL use explicit fallback order, label degraded results clearly, and prefer prompt partial answers over blocking when higher-confidence enrichment is pending.

**Fallback order:**
1. LSP first for semantic truth
2. Tree-sitter second for structural enrichment and limited heuristic recovery
3. text search last for broad fallback

**Action behavior:**
- `brief` works from the shared architecture model and is enriched by LSP/Tree-sitter when available
- `callers`, `implementations`, and `affected` prefer LSP and may return structural or heuristic, clearly-labeled partial output when only lower-confidence data is promptly available
- `callees` is a best-effort v1 action: it prefers semantic relationship data when available but may rely more heavily on structural or heuristic output in v1 than `callers` or `implementations`
- `pattern` is a direct text-search action and does not depend on LSP or Tree-sitter
- discovery-oriented semantic actions may accept narrowing filters such as `path`, symbol `kind`, or `exportedOnly` when those filters reduce ambiguity or token cost
- when LSP is `pending` or unavailable, the tool should return the best prompt bounded result it can, label the current confidence mode, and suggest a retry only when a rerun is likely to materially improve confidence

**Rationale:** Different actions need different confidence levels. This policy preserves a stable tool surface while being honest about precision.

**Alternatives considered:**
- Hard-fail all semantic actions without LSP — precise, but too limiting for real use
- Silent heuristic fallback — risks agents mistaking best-effort hints for semantic truth

### 6. Semantic actions must resolve a concrete target before analysis

**Decision:** Semantic actions (`callers`, `callees`, `implementations`, `affected`) SHALL accept either an explicit anchored target (`file`, `line`, `character`) or a discovery input such as `symbol`. The public `code_intel` tool uses 1-based `line` and `character` coordinates with UTF-16 character columns, matching the existing `lsp` and `tree_sitter` tools. Internally, `supi-code-intelligence` translates those public coordinates to the 0-based `Position` shape required by `SessionLspService`. When discovery is used, the tool may accept narrowing filters such as `path`, symbol `kind`, or `exportedOnly`. In v1, `exportedOnly` is the canonical public-surface filter; a broader language-specific `publicOnly` concept is deferred. If discovery input still resolves to multiple plausible targets, the tool returns a disambiguation result instead of silently merging or picking one.

**Disambiguation output:** Candidate targets should be retry-ready and low-friction to compare: each candidate includes display name, kind/container when available, `file`, 1-based `line`, 1-based `character`, a short reason/snippet, and rank order. Candidate lists should stay bounded by default and report omitted counts when truncated. This lets the agent immediately rerun the same action with anchored coordinates instead of opening files just to locate the symbol.

**Rationale:** LSP reference and implementation APIs are position-based, and symbol names are frequently duplicated across files. Requiring a concrete target or an explicit disambiguation round keeps semantic results trustworthy. Using the same public coordinate convention as the lower-level tools avoids off-by-one mistakes, while retry-ready candidates minimize follow-up token cost.

**Alternatives considered:**
- Accept only bare symbol names — convenient, but too ambiguous for reliable semantic analysis
- Silently pick the first match — simple to implement, but produces untrustworthy caller and impact reports
- Require anchored positions for every request — precise, but less usable for discovery-oriented workflows

### 7. Use structured markdown output with bounded, decision-oriented summaries

**Decision:** All `code_intel` output SHALL be structured markdown with a short answer card first, grouped sections, confidence labels, ranked high-value targets, and file/path references. Auto-injected overview content SHALL target a compact budget rather than dumping full API detail. On-demand actions SHALL default to concise output and expose bounded detail controls such as result/context limits. Tool results SHOULD also include structured `details` metadata for renderers, tests, and future automation.

**Confidence vocabulary:** `code_intel` SHOULD use a consistent four-mode vocabulary across actions and metadata:
- `semantic` — confirmed by semantic tooling such as LSP references, symbols, or implementations
- `structural` — derived from manifests, Tree-sitter, import/export graphs, or other parser/structure-backed analysis without semantic confirmation
- `heuristic` — inferred from text search or other looser best-effort signals
- `unavailable` — the requested analysis could not be produced with useful confidence

The word `degraded` may be used as a short umbrella description for any non-semantic path, but user-visible labels and structured metadata SHOULD prefer one of the four explicit modes above.

**Output shape:**
- Start with a one-to-three line summary answering “what should the agent know now?”
- Surface a small ranked set of highest-value files/modules/symbols before any long tail
- Use predictable default budgets so agents can trust the tool to stay cheap: the auto overview should usually stay within roughly eight modules/packages, eight dependency edges, and one hint; on-demand briefs should usually stay within roughly three “start here” targets, five notable surfaces, and two next-query hints unless the agent explicitly asks for more
- Group evidence by file/module and include `path:line` references when available
- Label source confidence using the shared vocabulary: semantic, structural, heuristic, or unavailable
- When the result is non-semantic or unavailable, say so explicitly and provide the next best move
- Collapse long tails with counts such as “+12 more matches omitted; rerun with a narrower path or higher limit”
- Omit empty sections, avoid boilerplate explanations, and prefer ranked summaries over exhaustive import/export dumps unless detail is the point of the request
- End with a brief “best next query” only when it helps, for example `code_intel affected` before editing a public export
- Include compact machine-readable `details` fields such as confidence, candidates, scope, omitted counts, and suggested next queries where practical

**Rationale:** The agent consumes markdown naturally, and grouped summaries improve triage. Bounded overview output preserves prompt budget while keeping richer detail available through on-demand `brief`. A dense module-edge format such as `supi-lsp → supi-core` should be preferred over verbose per-module prose in the auto-injected overview. The summary-first format gives agents useful context even when they only read the top of the tool result.

**Alternatives considered:**
- JSON-first output — better for machines, less ergonomic in the agent context
- Verbose prompt injection — easier to generate, but too expensive and distracting
- Raw grep/LSP dumps — complete, but not motivating or token-efficient for agent workflows

### 8. Make tool guidance compact, specific, and motivating

**Decision:** The registered tool SHALL include a `promptSnippet` and `promptGuidelines` that make `code_intel` feel like the obvious first stop for architecture and impact questions. Because pi flattens tool prompt guidelines into the global `Guidelines:` section, every guideline bullet SHALL explicitly name `code_intel`.

**Guidance content:**
- Use `code_intel brief` before editing an unfamiliar package, directory, or file when architecture/context would reduce blind reads
- Use `code_intel affected` before changing exported APIs, shared helpers, config surfaces, or cross-package contracts
- Use `code_intel callers` / `callees` / `implementations` for semantic relationship questions before falling back to broad text search
- Use `code_intel pattern` for bounded literal/regex search when the question is textual rather than semantic
- Map plain-language intent to actions explicitly in guidance: “orient me” → `brief`, “who uses this?” → `callers`, “what does this call?” → `callees`, “what breaks if I change this?” → `affected`, and “find concrete implementations” → `implementations`
- Use raw `lsp` and `tree_sitter` tools for precise drill-down after `code_intel` identifies the relevant file, symbol, or syntax node
- When `lsp` and `tree_sitter` are also active, make `code_intel` the orchestrating first stop for architecture, impact, and summarized relationship questions; keep substrate guidance accurate but non-competing by positioning lower-level tools as exact drill-down after `code_intel` narrows the target

**Rationale:** Agents follow concise, concrete tool-selection rules better than abstract capability lists. The guidance should reduce hesitation by telling the agent exactly when `code_intel` saves tokens and improves correctness, while avoiding a bloated system prompt. Because existing `lsp` guidance also encourages semantic navigation, this change must explicitly deconflict the stack so agents do not hesitate between peer tools for high-level questions.

**Alternatives considered:**
- Rely on the tool description only — discoverable, but weaker than explicit prompt guidance
- Add aggressive “always use” rules — increases unnecessary tool calls and token use
- Compete with `lsp` / `tree_sitter` guidance — confusing; this package should orchestrate first and drill down when needed

### 9. Tool parameter shape stays flat, role-oriented, and short

**Decision:** `code_intel` SHALL use a flat action-oriented parameter schema rather than nested per-action payloads. Common calls should usually require only `action` plus one target field group.

**Canonical v1 parameter shape:**

```json
{
  "action": "brief | callers | callees | implementations | affected | pattern",
  "path": "optional scope or focus path",
  "file": "optional anchored target file",
  "line": 1,
  "character": 1,
  "symbol": "optional discovery symbol",
  "pattern": "optional text-search pattern",
  "kind": "optional discovery kind filter",
  "exportedOnly": true,
  "maxResults": 8,
  "contextLines": 1
}
```

**Field roles:**
- `path` narrows or focuses analysis to a package, directory, or file path
- `file` is for anchored location-based analysis and SHOULD usually appear with `line` and `character`
- `symbol` is for semantic discovery when the exact location is not yet known
- `pattern` is only for the text-search action and SHOULD NOT be reused as a generic symbol query field
- `kind`, `exportedOnly`, `maxResults`, and `contextLines` are optional refinements

**Ergonomic rules:**
- Prefer one flat schema over nested `target`, `scope`, or `options` objects so calls stay short in the prompt
- Keep `path` and `file` semantically distinct: `path` scopes/focuses; `file` anchors positions
- Normalize a leading `@` on `path` or `file` to match pi's built-in path-tool convention
- Ignore irrelevant optional fields per action rather than forcing action-specific wrapper objects

**Representative calls:**
```json
{ "action": "brief", "path": "packages/supi-lsp/" }
{ "action": "brief", "file": "packages/supi-lsp/lsp.ts", "line": 42, "character": 7 }
{ "action": "callers", "symbol": "registerSettings", "path": "packages/supi-core/", "exportedOnly": true }
{ "action": "callees", "file": "packages/supi-lsp/tool-actions.ts", "line": 88, "character": 12 }
{ "action": "implementations", "symbol": "SessionLspService", "path": "packages/" }
{ "action": "affected", "file": "packages/supi-core/index.ts", "line": 12, "character": 8 }
{ "action": "pattern", "pattern": "registerSettings", "path": "packages/", "maxResults": 10, "contextLines": 1 }
```

**Rationale:** Agents do better with short, memorable schemas than with deeply nested option objects. Separating `path` from anchored `file` positions reduces ambiguity, and a flat schema keeps follow-up calls copyable from tool output. A small set of representative examples helps models infer the intended call shape quickly without requiring verbose prose.

**Alternatives considered:**
- Nested per-action payloads such as `{ action, target: { ... }, options: { ... } }` — more explicit, but noisier and more token-expensive
- Separate tools per action — clearer validation boundaries, but worse discoverability and larger prompt surface
- Reusing one generic `query` field for symbol and text search — shorter schema, but ambiguous and error-prone

### 10. Match repository packaging and verification surfaces explicitly

**Decision:** The change includes both publish surfaces and root verification scripts as first-class implementation work.

**Required wiring:**
- root `package.json` `pi.extensions`, ordered after `supi-lsp` and `supi-tree-sitter` so session services and lower-layer tools are available before `code_intel` guidance/handlers run
- `packages/supi/package.json` dependency and wrapper entrypoint, also ordered after the lower-layer wrappers
- package `tsconfig.json` and test `tsconfig.json` placement under `packages/supi-code-intelligence/` so existing root glob scripts discover them
- package files/dependency metadata that pack correctly through the standalone package and meta-package surfaces

**Rationale:** This repo does not discover pi extensions automatically for publishing, but root verification now discovers package and test tsconfigs through `packages/*` globs. If these surfaces are omitted, the extension can appear implemented locally while being absent from the published meta-package or accidentally skipped by `pnpm verify`.

## Product Lessons from pi-lens

A review of `apmantza/pi-lens` confirms several UX patterns worth adopting without importing its broader diagnostics/formatting scope:

- Keep low-level tools available, but give agents one opinionated first-stop path. pi-lens exposes focused navigation/search tools and startup guidance instead of hiding every lower layer. `code_intel` should similarly orchestrate first while leaving `lsp` and `tree_sitter` for exact drill-down.
- Make injected context one-shot and compact. pi-lens caches session/turn findings and consumes them once to avoid repeated noise. `supi-code-intelligence` should avoid duplicate architecture overview messages after reload/resume and should not replay stale findings.
- Prefer bounded, actionable impact summaries. pi-lens' review graph formats cascades as changed symbols, direct importers/callers, "check next" files, and risk flags. `affected` should use the same summary-first spirit rather than returning raw reference dumps.
- Support fast startup paths. pi-lens separates quick startup from heavier background scans. The auto overview should be metadata/manifest-first, opportunistically enriched, and never block the first answer on deep whole-repo analysis.
- Let agents focus by symbol, not only by file. pi-lens expands narrow reads to enclosing symbols when possible. `code_intel brief` should support an anchored file position for an enclosing-symbol brief when that is cheaper than a full file or package brief.

These are product lessons only. `supi-code-intelligence` remains a concise architecture/search extension, not a replacement for pi-lens' real-time formatting, diagnostics, read guards, or broad multi-language lint pipeline.

## Risks / Trade-offs

- **[Coupling to lower-layer internals]** → Directly depending on `supi-lsp` and `supi-tree-sitter` service APIs creates workspace coupling. **Mitigation:** keep their reusable APIs explicit and update the stack in sync within the monorepo.
- **[Substrate contract drift]** → `supi-code-intelligence` depends on public APIs from `supi-lsp`, `supi-tree-sitter`, and `supi-core`. **Mitigation:** import only from package roots, cover integration behavior with tests, and update this spec if substrate public contracts change.
- **[Non-semantic fallbacks can be misleading]** → Degraded `callers`/`callees`/`implementations`/`affected` results may look more authoritative than they are. **Mitigation:** label non-semantic results clearly as `structural`, `heuristic`, or `unavailable`, and separate them from semantic truth sections.
- **[Overview token cost]** → Session-start architecture context can crowd the prompt. **Mitigation:** inject only once per session and keep the overview compact, with deeper detail only via `brief`.
- **[Startup latency]** → Building the first architecture model may add noticeable delay. **Mitigation:** start from cheap metadata scans, enrich opportunistically, and avoid project-wide deep analysis in the auto-injected path.
- **[Responsibility creep]** → The package may accumulate low-level features that belong in `supi-tree-sitter` or `supi-lsp`. **Mitigation:** keep raw parser/server operations in the substrate packages and limit `supi-code-intelligence` to synthesis and high-level UX.

## Superseded Changes

This change supersedes the earlier `supi-code-intel` and `supi-codebase-map` directions. The `code_intel` tool and its `brief`, `callers`, `callees`, `implementations`, `affected`, and `pattern` actions replace `supi-code-intel`. `code_intel brief` replaces the separate `codebase_map` tool, while `supi-tree-sitter` replaces regex-first structural extraction for supported JS/TS-family files. Broad multi-language regex extraction and the standalone `codebase_map` API are intentionally deferred rather than accidentally omitted.

One piece from `supi-codebase-map` remains valuable as independent shared infrastructure: extracting LSP-agnostic project/root utilities from `supi-lsp` into `supi-core`. That prerequisite has landed, so `supi-code-intelligence` should use `supi-core`'s public helpers instead of recreating the old local logic.

## Migration Plan

- Confirm landed substrate APIs from `supi-core`, `supi-tree-sitter`, and `supi-lsp` are consumed from package roots
- Add `packages/supi-code-intelligence/` as a new standalone workspace package
- Wire it into the workspace root pi manifest and the published `@mrclrchtr/supi` meta-package wrapper surface
- Verify root glob-based typecheck/test scripts and `pnpm verify` cover the new package
- Keep existing lower-level packages unchanged from a user-facing tool-contract perspective; `supi-code-intelligence` composes them without altering the existing `lsp` or `tree_sitter` action surfaces
