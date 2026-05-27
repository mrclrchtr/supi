# @mrclrchtr/supi-code-intelligence

Architecture briefs with structural enrichment, reference/usages tracing, outgoing call analysis, implementation lookup, impact assessment, explicit search, and two-step semantic refactoring for pi.

Surfaces:
- `@mrclrchtr/supi-code-intelligence/extension` → `src/extension.ts` registers the focused tool surface (`code_brief`, `code_references`, `code_calls`, `code_implementations`, `code_affected`, `code_pattern`, `code_refactor_plan`, `code_refactor_apply`)
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
├── types.ts                # Result metadata types (BriefDetails, SearchDetails, AffectedDetails, etc.)
├── brief.ts                # Public facade for brief/overview helpers (compatibility shim)
├── brief-focused.ts        # Directory/file/symbol focused brief generation
├── git-context.ts          # Git branch, dirty files, last commit helpers
├── model.ts                # Project model builder for auto-injected overviews
├── target-resolution.ts    # Backward-compat facade over targeting pipeline
├── search-helpers.ts       # ripgrep wrapper, path normalization, URI helpers
├── pattern-structured.ts   # Tree-sitter-based structured pattern search
├── prioritization-signals.ts # Diagnostics, coverage, knip unused signals
├── semantic-action-helpers.ts # Shared confidence/resolution helpers
├── intent/
│   └── types.ts            # Normalized intent and routing contracts (PlannerRoute, etc.)
├── targeting/              # Canonical targeting pipeline (normalize-query, resolve-*, types)
├── use-case/               # Typed orchestration modules (build-overview, generate-*)
├── lsp/                    # LSP tool actions, specs, guidance, lifecycle, diagnostics
├── tree-sitter/            # TS tool actions, specs, guidance, execute, format, lifecycle
├── app/
│   ├── create-code-intelligence-app.ts  # App composition root — wires pi events
│   ├── workspace-manager.ts  # Per-cwd workspace session lifecycle
│   └── workspace-session.ts  # Session-scoped state (overview injection, model cache, adapter refs)
├── analysis/
│   ├── context/
│   │   └── request-context.ts  # Explicit analysis context over shared broker
│   ├── architecture/
│   ├── routing/
│   │   └── planner.ts          # Central capability router (canonical)
│   ├── targeting/
│   │   ├── types.ts            # Re-exported canonical targeting types
│   │   ├── normalize-query.ts  # Re-exported query normalization
│   │   ├── resolve-target.ts   # Unified target resolution facade
│   │   └── disambiguation.ts   # Disambiguation formatting
│   ├── references/             # Semantic reference collection service
│   │   └── service.ts
│   ├── calls/                  # Structural outgoing call service
│   │   └── service.ts
│   ├── implementations/        # Semantic implementation service
│   │   └── service.ts
│   ├── relations/
│   │   ├── types.ts            # Shared types (CallerEvidence, RelationsServiceDeps)
│   │   ├── callers.ts          # Semantic caller (reference) collection
│   │   ├── implementations.ts  # Semantic implementation lookup
│   │   └── callees.ts          # Structural callee lookup
│   └── refactor/
│       ├── safety.ts           # Edit validation
│       ├── apply-workspace-edit.ts # File mutation
│       └── plan-store.ts       # Two-step refactor plan storage
├── tool/
│   ├── tool-specs.ts           # Single source of truth for public tool metadata
│   ├── guidance.ts             # Intent-first prompt surfaces from specs
│   ├── register-tools.ts       # Focused Pi tool registration (iterates over specs)
│   ├── validation.ts           # Shared parameter validation
│   ├── execute-brief.ts        # code_brief tool executor
│   ├── execute-references.ts   # code_references tool executor
│   ├── execute-calls.ts        # code_calls tool executor
│   ├── execute-implementations.ts # code_implementations tool executor
│   ├── execute-affected.ts     # code_affected tool executor
│   ├── execute-pattern.ts      # code_pattern tool executor
│   ├── execute-refactor-plan.ts  # code_refactor_plan tool executor
│   └── execute-refactor-apply.ts # code_refactor_apply tool executor
├── presentation/markdown/
│   ├── overview.ts             # Hidden overview markdown renderer
│   ├── brief.ts                # Brief markdown renderer
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

**Enriched file briefs** — When a code provider is available, `code_brief` with `file:` shows:
- **Outline** — top-level declarations (functions, classes, interfaces) from tree-sitter
- **Imports** — module dependencies from tree-sitter
- **Exports** — exported names with kinds from tree-sitter
- **Diagnostics** — LSP errors and warnings (first 5 messages inline)

**Enriched module briefs** — When LSP is active, `code_brief` with `path:` targeting a package root shows aggregate diagnostics across all source files.

**`maxResults`** — Controls section caps: outline items (default 15), imports (default 10), exports (default 10), diagnostic messages (default 5), source file listings (default 10). When omitted, defaults apply.

**Directory brief enrichment** — When targeting a directory, briefs include:
- **Extension breakdown** — per-extension file counts across the full tree
- **Landmark files** — well-known project configuration files (`package.json`, `tsconfig.json`, etc.)

**Module brief enrichment** — Module root briefs include the same extension breakdown and landmarks as directory briefs, plus aggregate diagnostics across source files when LSP is active.

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
- `code_pattern` is the sole heuristic/search-oriented tool.
- `code_references`, `code_calls`, `code_implementations`, and `code_affected` should prefer explicit unavailable states over text-search guesses.

### Param validation
- `line`/`character` require `file`, **not** `path`.
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
