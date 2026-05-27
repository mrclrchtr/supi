# @mrclrchtr/supi-code-intelligence

Architecture briefs, factual code maps, relationship tracing, impact assessment, explicit search, and direct-apply semantic refactoring for pi.

Surfaces:
- `@mrclrchtr/supi-code-intelligence/extension` → `src/extension.ts` registers the focused tool surface (`code_brief`, `code_map`, `code_references`, `code_calls`, `code_implementations`, `code_affected`, `code_pattern`, `code_refactor_plan`, `code_refactor_apply`)
- May include cross-family orchestration guidance that steers the model between `code_*`, `lsp_*`, and `tree_sitter_*` tools; guidance routes by user intent first, substrate family second
- Installing this package activates all three tool families (`code_*`, `lsp_*`, `tree_sitter_*`)
- Does **not** own a session-scoped cache or runtime service — reads capability state from the shared workspace broker (`@mrclrchtr/supi-code-runtime`)
- `@mrclrchtr/supi-code-intelligence/api` → `src/api.ts` / `src/index.ts` exposes reusable architecture helpers

## Architecture

```text
src/
├── code-intelligence.ts    # Extension factory — composition root over all five internal layers
├── extension.ts            # Re-exports code-intelligence.ts for pi extension discovery
├── index.ts                # Public API exports for programmatic consumers
├── api.ts                  # Re-export surface for @mrclrchtr/supi-code-intelligence/api
├── types.ts                # Result metadata types (BriefDetails, MapDetails, SearchDetails, etc.)
├── brief.ts                # Public facade for brief/overview helpers (compatibility shim)
├── brief-focused.ts        # Directory/file/symbol focused brief generation
├── git-context.ts          # Git branch, dirty files, last commit helpers
├── model.ts                # Project model builder for auto-injected overviews
├── resolve-target.ts       # Compatibility shim → analysis/targeting/resolve-target.ts
├── target-resolution.ts    # Backward-compat facade over targeting pipeline
├── search-helpers.ts       # ripgrep wrapper, path normalization, URI helpers
├── pattern-structured.ts   # Tree-sitter-based structured pattern search
├── prioritization-signals.ts # Diagnostics, coverage, knip unused signals
├── semantic-action-helpers.ts # Shared confidence/resolution helpers
├── intent/
│   └── types.ts            # Normalized intent and routing contracts (PlannerRoute, etc.)
├── planner/
│   └── planner.ts          # Compatibility shim → analysis/routing/planner.ts
├── refactor/
│   ├── safety.ts           # Forwarder → analysis/refactor/safety.ts
│   └── apply-workspace-edit.ts # Forwarder → analysis/refactor/apply-workspace-edit.ts
├── targeting/              # Canonical targeting pipeline (normalize-query, resolve-*, types)
├── use-case/               # Compatibility forwarders or transitional orchestration
├── lsp/                    # LSP tool action adapters, specs, guidance (transitional → tool/families/lsp)
├── tree-sitter/            # TS tool action adapters, specs, guidance (transitional → tool/families/tree-sitter)
├── workspace/
│   └── request-context.ts  # Compatibility shim → analysis/context/request-context.ts
├── app/
│   ├── create-code-intelligence-app.ts  # App composition root — wires pi events
│   ├── workspace-manager.ts  # Per-cwd workspace session lifecycle
│   └── workspace-session.ts  # Session-scoped state (overview injection, model cache, adapter refs)
├── substrate/
│   ├── semantic/
│   │   ├── state.ts        # LspAdapterState forwarder
│   │   ├── lifecycle.ts    # LSP session lifecycle forwarder
│   │   ├── diagnostics.ts  # Diagnostic injection forwarder
│   │   ├── recovery.ts     # Workspace recovery forwarder
│   │   ├── settings.ts     # LSP settings forwarder
│   │   └── overrides.ts    # LSP-aware tool overrides forwarder
│   └── structural/
│       ├── state.ts        # TsAdapterState forwarder
│       └── lifecycle.ts    # Tree-sitter session lifecycle forwarder
├── analysis/
│   ├── context/
│   │   └── request-context.ts  # Explicit analysis context over shared broker
│   ├── architecture/
│   │   ├── model-service.ts    # Canonical architecture model service
│   │   └── model-cache.ts      # Session/workspace model cache
│   ├── routing/
│   │   └── planner.ts          # Central capability router (canonical)
│   ├── targeting/
│   │   ├── types.ts            # Re-exported canonical targeting types
│   │   ├── normalize-query.ts  # Re-exported query normalization
│   │   ├── resolve-target.ts   # Unified target resolution facade
│   │   └── disambiguation.ts   # Disambiguation formatting
│   ├── brief/service.ts        # Typed brief analysis service
│   ├── map/service.ts          # Typed map analysis service
│   ├── relations/
│   │   ├── types.ts            # Typed relation result/evidence shapes
│   │   ├── service.ts          # Relations dispatcher by kind
│   │   ├── callers.ts          # Semantic caller collection
│   │   ├── implementations.ts  # Semantic implementation lookup
│   │   └── callees.ts          # Structural callee lookup
│   ├── affected/service.ts     # Typed affected analysis service
│   ├── pattern/service.ts      # Typed pattern search service
│   └── refactor/
│       ├── service.ts          # Typed refactor service
│       ├── safety.ts           # Edit validation
│       └── apply-workspace-edit.ts # File mutation
├── tool/
│   ├── tool-specs.ts           # Single source of truth for public tool metadata
│   ├── guidance.ts             # Intent-first prompt surfaces from specs
│   ├── register-tools.ts       # Focused Pi tool registration (iterates over specs)
│   ├── validation.ts           # Shared parameter validation (forwarder → common/validation)
│   ├── execute-*.ts            # Tool executors (transitional forwarders)
│   ├── common/
│   │   ├── register-family.ts  # Shared registration helper
│   │   └── validation.ts       # Shared validation primitives
│   └── families/
│       ├── code/
│       │   └── execute-relations.ts  # code_relations tool edge (transitional)
│       ├── lsp/
│       │   ├── execute.ts      # LSP tool execution adapters
│       │   └── format.ts       # LSP tool formatting
│       └── tree-sitter/
│           ├── execute.ts      # Tree-sitter tool execution adapters
│           └── format.ts       # Tree-sitter tool formatting
├── presentation/markdown/
│   ├── overview.ts             # Hidden overview markdown renderer
│   ├── brief.ts                # Brief markdown renderer
│   ├── map.ts                  # Factual map markdown renderer
│   ├── relations.ts            # Relations markdown renderer (callers/callees/implementations)
│   ├── affected.ts             # Affected markdown renderer
│   ├── pattern.ts              # Pattern search markdown renderer
│   └── refactor.ts             # Refactor result markdown renderer
└── ui/
    ├── code-intelligence-status-command.ts  # /ci-status command
    ├── code-intelligence-status-view.ts     # TUI status surface
    └── lsp-message-renderer.ts              # lsp-context custom message renderer
```

## Public tool contracts

### `code_brief`
Interpretive orientation tool. The planner selects the best provider (semantic or structural) automatically. For deeper semantic detail, follow up with `lsp_hover`/`lsp_definition`/`lsp_references`.

### `code_map`
Strictly factual inventory tool. Accepts the repo root, a package root, or **any directory path**. Rejects file paths.

### `code_references`
Semantic references/usages for a resolved target. Uses LSP internally.

### `code_calls`
Structural outgoing calls from the enclosing function or method. Uses tree-sitter internally.

### `code_implementations`
Semantic implementation lookup for an interface, class, or method. Uses LSP internally.

### `code_affected`
Semantic blast-radius tool. Uses semantic evidence. Does not fall back to heuristic search.

### `code_pattern`
Explicit search tool. This is the only tool in the family that intentionally exposes heuristic/text-search behavior.

### `code_refactor_plan`
Preview-only semantic rename planning. Reads capability state from the shared broker, calls LSP rename, validates the workspace edit, computes file fingerprints for staleness detection, and returns a preview with a plan ID. Does not mutate files.

### `code_refactor_apply`
Apply a previously generated refactor plan by plan ID. Retrieves the plan from the in-memory store, rechecks file fingerprints, re-validates ranges and overlap, applies deterministically through safety gates, and reports results. Rejects stale, missing, or invalid plans.

## Key gotchas

### Planner routing
- The `planner.ts` central router reads capability state from the shared broker and returns `PlannerRoute` for each tool intent.
- `code_refactor_plan` checks `refactorAvailable` from the semantic capability slot.
- `code_refactor_apply` does not require a live semantic provider — plan validity is enforced through fingerprint comparison in the executor.
- When no capability is available, the planner returns `preferred: "unavailable"` and the execute function returns an explicit error message.

### Public-surface split
- `code_map` must stay factual. Do not add prioritized "start here" guidance there.
- `code_pattern` is the sole heuristic/search-oriented tool.
- `code_references`, `code_calls`, `code_implementations`, and `code_affected` should prefer explicit unavailable states over text-search guesses.

### Param validation
- `line`/`character` require `file`, **not** `path`.
- `code_map` should reject file paths.
- `code_refactor_plan` requires `file`, `line`, `character`, `operation`, and `newName`.
- `code_refactor_apply` requires `planId`.

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
- `code_refactor_plan` validates the edit before generating a plan; returns `unavailable` or `ambiguous` if the provider cannot produce precise edits.
- `code_refactor_apply` rejects stale plans by comparing stored SHA-256 file fingerprints to current contents, and re-validates ranges before applying.
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
