# @mrclrchtr/supi-code-intelligence

Architecture briefs, factual code maps, relationship tracing, impact assessment, explicit search, and direct-apply semantic refactoring for pi.

Surfaces:
- `@mrclrchtr/supi-code-intelligence/extension` → `src/extension.ts` registers the focused tool surface (`code_brief`, `code_map`, `code_relations`, `code_affected`, `code_pattern`, `code_refactor`)
- May include cross-family orchestration guidance that steers the model between `code_*`, `lsp_*`, and `tree_sitter_*` tools; guidance routes by user intent first, substrate family second
- Installing this package activates all three tool families (`code_*`, `lsp_*`, `tree_sitter_*`)
- Does **not** own a session-scoped cache or runtime service — reads capability state from the shared workspace broker (`@mrclrchtr/supi-code-runtime`)
- `@mrclrchtr/supi-code-intelligence/api` → `src/api.ts` / `src/index.ts` exposes reusable architecture helpers

## Architecture

```text
src/
├── code-intelligence.ts    # Extension factory — overview injection + focused tool registration
├── index.ts                # Public API exports for programmatic consumers
├── types.ts                # Result metadata types (BriefDetails, MapDetails, SearchDetails, etc.)
├── brief.ts                # Public facade for brief/overview helpers (delegates to use-case + presentation)
├── brief-focused.ts        # Directory/file/symbol focused brief generation
├── git-context.ts          # Git branch, dirty files, last commit helpers
├── model.ts                # Project model builder for auto-injected overviews
├── resolve-target.ts       # Action-facing target resolution — routes normalized queries, maps typed outcomes
├── target-resolution.ts    # Facade over the targeting pipeline (backward-compat exports)
├── intent/
│   └── types.ts            # Normalized intent and routing contracts (PlannerRoute, etc.)
├── planner/
│   └── planner.ts          # Central capability router — reads broker state, returns routing decisions per tool intent
├── refactor/
│   ├── safety.ts           # Edit validation — rejects empty/invalid/bounds-violating workspace edits
│   └── apply-workspace-edit.ts # Deterministic file mutation with reverse-order depth-first edit ordering
├── targeting/
│   ├── types.ts               # Normalized query, resolver deps, typed outcomes
│   ├── query.ts                # Params → NormalizedQuery normalization
│   ├── resolve-anchored.ts     # File + position resolution (no LSP needed)
│   ├── resolve-symbol.ts       # Semantic symbol discovery (LSP-only, no text fallback)
│   └── resolve-file.ts         # File-level target group discovery (LSP+Tree-sitter with fallback)
├── use-case/
│   ├── types.ts                # Shared typed data interfaces (OverviewData, BriefInput, etc.)
│   ├── build-overview.ts       # Hidden overview data builder from ArchitectureModel
│   ├── generate-brief.ts       # Brief orchestration — project/path/file/anchored/symbol
│   ├── generate-map.ts         # Map orchestration — factual filesystem inventory
│   ├── generate-relations.ts   # Relations orchestration — callers, callees, implementations
│   ├── generate-affected.ts    # Affected orchestration — impact analysis
│   ├── generate-pattern.ts     # Pattern orchestration — literal/regex/structured search
│   └── support/
│       └── semantic-references.ts  # Shared reference collection/aggregation helpers
├── presentation/markdown/
│   ├── overview.ts             # Hidden overview markdown renderer
│   ├── brief.ts                # Brief markdown renderer (anchored + symbol)
│   ├── map.ts                  # Factual map markdown renderer
│   ├── relations.ts            # Relations markdown renderer (callers/callees/implementations)
│   ├── affected.ts             # Affected markdown renderer
│   ├── pattern.ts              # Pattern search markdown renderer
│   └── refactor.ts             # Refactor result markdown renderer
├── search-helpers.ts       # ripgrep wrapper, path normalization, URI helpers
├── pattern-structured.ts   # Tree-sitter-based structured pattern search
├── prioritization-signals.ts # Diagnostics, coverage, knip unused signals
├── semantic-action-helpers.ts # Shared confidence/resolution helpers
├── workspace/
│   └── request-context.ts  # Composite provider read from shared broker (deprecated in favor of planner)
├── tool/
│   ├── tool-specs.ts          # Single source of truth for the public focused-tool metadata
│   ├── guidance.ts            # Intent-first prompt surfaces derived from tool specs
│   ├── register-tools.ts      # Focused Pi tool registration (iterates over specs)
│   ├── execute-brief.ts       # Planner-backed code_brief adapter
│   ├── execute-map.ts         # code_map adapter
│   ├── execute-relations.ts   # Planner-backed code_relations adapter
│   ├── execute-affected.ts    # code_affected adapter
│   ├── execute-pattern.ts     # code_pattern adapter
│   ├── execute-refactor.ts    # code_refactor — reads broker, calls semantic rename, validates, applies
│   └── validation.ts          # Shared parameter validation
└── substrates/
    ├── types.ts             # Substrate interface aliases (SemanticSubstrate, StructuralSubstrate)
    ├── lsp-adapter.ts       # Session-scoped LSP access via SemanticSubstrate
    └── tree-sitter-adapter.ts # Shared Tree-sitter service access via StructuralSubstrate
```

## Public tool contracts

### `code_brief`
Interpretive orientation tool. The planner selects the best provider (semantic or structural) automatically. For deeper semantic detail, follow up with `lsp_hover`/`lsp_definition`/`lsp_references`.

### `code_map`
Strictly factual inventory tool. Accepts the repo root, a package root, or **any directory path**. Rejects file paths.

### `code_relations`
Relationship tracing tool with `kind: "callers" | "callees" | "implementations"`.
- `callers` and `implementations` — semantic-only, routed by the planner
- `callees` — structural-only, routed by the planner

### `code_affected`
Semantic blast-radius tool. Uses semantic evidence. Does not fall back to heuristic search.

### `code_pattern`
Explicit search tool. This is the only tool in the family that intentionally exposes heuristic/text-search behavior.

### `code_refactor`
Direct-apply semantic refactoring. Supports `rename` operations. Reads capability state from the shared broker, validates workspace edits through safety gates, applies deterministically, and reports results. Does not fall back to heuristic text replacement when precise edits are unavailable.

## Key gotchas

### Planner routing
- The `planner.ts` central router reads capability state from the shared broker and returns `PlannerRoute` for each tool intent.
- `code_refactor` checks `refactorAvailable` from the semantic capability slot (no separate broker slot needed).
- When no capability is available, the planner returns `preferred: "unavailable"` and the execute function returns an explicit error message.

### Public-surface split
- `code_map` must stay factual. Do not add prioritized "start here" guidance there.
- `code_pattern` is the sole heuristic/search-oriented tool.
- `code_relations` and `code_affected` should prefer explicit unavailable states over text-search guesses.

### Param validation
- `line`/`character` require `file`, **not** `path`.
- `code_map` should reject file paths.
- `code_refactor` requires `file`, `line`, `character`, `operation`, and `newName`.

### Target resolution
- Symbol discovery is semantic-only for non-search tools.
- File-level target expansion is allowed only when the required substrate can support it.
- The planner delegates to the existing targeting pipeline (`resolve-target.ts` and `src/targeting/*`).

### First-turn overview
- Injected via `before_agent_start` on the first turn; deduplicated via `hasInjectedOverview`.
- Uses `display: false` so the overview is agent-visible but TUI-invisible.
- On reload/resume, scans the branch for an existing `code-intelligence-overview` custom message.

### Refactor safety
- `validateEdit()` rejects empty edits and invalid ranges before filesystem apply.
- `code_refactor` refuses to apply when the provider returns `unavailable` or `ambiguous` results.
- No heuristic text fallback.

## Dependencies

- **`@mrclrchtr/supi-core/api`** — `findProjectRoot`, `walkProject`, `isWithinOrEqual`
- **`@mrclrchtr/supi-code-runtime/api`** — `getDefaultWorkspaceRuntime`, `SemanticProvider`, `StructuralProvider`, `RefactorResult`, `WorkspaceEdit`, `PlannerRoute`
- **`@mrclrchtr/supi-lsp/api`** — `getSessionLspService`, `SessionLspService`, `Position`
- **`@mrclrchtr/supi-tree-sitter/api`** — `getSessionTreeSitterService`, `createTreeSitterSession`, `TreeSitterService`
- **`@earendil-works/pi-ai`** — `StringEnum` for TypeScript enum type generation
- **`@earendil-works/pi-coding-agent`** — `ExtensionAPI`, `BeforeAgentStartEventResult`
- **`typebox`** — `Type.Object(...)` for tool parameter schema
- **External runtime**: `rg` (ripgrep) via `child_process.execFileSync`

## License

MIT
