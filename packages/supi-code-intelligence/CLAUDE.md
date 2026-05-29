# @mrclrchtr/supi-code-intelligence

Architecture briefs with structural enrichment, reference/usages tracing, outgoing call analysis, implementation lookup, impact assessment, explicit search, and two-step semantic refactoring for pi.

Surfaces:
- `@mrclrchtr/supi-code-intelligence/extension` → `src/extension.ts` registers the focused code-only tool surface (`code_brief`, `code_graph`, `code_affected`, `code_find`, `code_health`, `code_resolve`, `code_refactor_plan`, `code_refactor_apply`)
- Historical substrate-named tools are no longer registered on the public surface as of Phase 1.5. The LSP and tree-sitter libraries remain as internal substrates.
- Installing this package activates only `code_*` tools
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
├── lsp/                    # LSP lifecycle, diagnostics, settings, tool overrides, workspace recovery
├── tree-sitter/            # Tree-sitter session lifecycle (substrate only)
├── app/
│   ├── create-code-intelligence-app.ts  # App composition root — wires pi events
│   ├── workspace-manager.ts  # Per-cwd workspace session lifecycle
│   └── workspace-session.ts  # Session-scoped state (overview injection, model cache, adapter refs)
├── analysis/
│   ├── context/
│   │   └── request-context.ts  # Explicit analysis context over shared broker
│   ├── resolve/
│   │   └── service.ts          # code_resolve business logic (Phase 1)
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
│   ├── tool-specs.ts           # Single source of truth for current public tool metadata
│   ├── guidance.ts             # Intent-first prompt surfaces from specs
│   ├── register-tools.ts       # Focused Pi tool registration (iterates over specs)
│   ├── validation.ts           # Shared parameter validation
│   ├── target-id-params.ts     # targetId expansion helper (Phase 1)
│   ├── execute-brief.ts        # code_brief tool executor
│   ├── execute-graph.ts        # code_graph tool executor (unified relations)
│   ├── execute-affected.ts     # code_affected tool executor
│   ├── execute-find.ts         # code_find tool executor
│   ├── execute-resolve.ts      # code_resolve tool executor (Phase 1)
│   ├── execute-refactor-plan.ts  # code_refactor_plan tool executor
│   └── execute-refactor-apply.ts # code_refactor_apply tool executor
├── workflow/
│   ├── names.ts               # Canonical planned V2 workflow tool names
│   ├── ids.ts                 # Planned V2 workflow handle contracts (TargetId, PlanId, etc.)
│   ├── results.ts             # Shared structured result envelope and provenance types
│   ├── schemas.ts             # Planned V2 workflow tool parameter schemas
│   ├── surface.ts             # Canonical planned V2 tool metadata
│   ├── target-store.ts        # Session-scoped target/span handle registry (Phase 1)
│   └── index.ts               # Internal barrel for workflow skeleton consumers/tests
├── presentation/markdown/
│   ├── overview.ts             # Hidden overview markdown renderer
│   ├── brief.ts                # Brief markdown renderer
│   ├── relations.ts            # Relations markdown renderer (callers/callees/implementations)
│   ├── affected.ts             # Affected markdown renderer
│   ├── pattern.ts              # Pattern/find search markdown renderer
│   ├── refactor.ts             # Refactor result markdown renderer
│   └── resolve.ts              # code_resolve markdown renderer (Phase 1)
│   └── health.ts               # code_health markdown renderer (Phase 1.5)
└── ui/
    ├── code-intelligence-status-command.ts  # /ci-status command
    ├── code-intelligence-status-view.ts     # TUI status surface
    └── lsp-message-renderer.ts              # lsp-context custom message renderer
```

## Public tool contracts

### `code_brief`
Interpretive orientation tool. The planner selects the best provider (semantic or structural) automatically. For deeper detail, follow up with `code_graph`.

**Enriched file briefs** — When a code provider is available, `code_brief` with `file:` shows:
- **Outline** — top-level declarations (functions, classes, interfaces) from tree-sitter
- **Imports** — module dependencies from tree-sitter
- **Exports** — exported names with kinds from tree-sitter
- **Diagnostics** — LSP errors and warnings (first 5 messages inline)

**Anchored briefs** — When `code_brief` is called with `file:` + `line:` + `character:`, additional best-effort LSP sections appear at the position:
- **Node** — tree-sitter syntax node at the position
- **Hover** — type/signature info from LSP hover
- **Definition** — go-to-definition targets from LSP
- **Code Actions** — available fix titles from LSP (suggestions only, not applied)
- **Enclosing symbol** — the function/class/method containing the position

**Enriched module briefs** — When LSP is active, `code_brief` with `path:` targeting a package root shows aggregate diagnostics across all source files.

**`maxResults`** — Controls section caps: outline items (default 15), imports (default 10), exports (default 10), diagnostic messages (default 5), source file listings (default 10). When omitted, defaults apply.

**Directory brief enrichment** — When targeting a directory, briefs include:
- **Extension breakdown** — per-extension file counts across the full tree
- **Landmark files** — well-known project configuration files (`package.json`, `tsconfig.json`, etc.)

**Module brief enrichment** — Module root briefs include the same extension breakdown and landmarks as directory briefs, plus aggregate diagnostics across source files when LSP is active.

### `code_graph`
Unified relation-graph tool. Replaces `code_references`, `code_calls`, `code_implementations`.

- **targetId** (preferred from `code_resolve`) or file+line+character or symbol
- **relations**: `["references", "callees", "imports", "exports", "implements", "tests"]` — default `["references"]`
- **direction**, **depth**, **maxNodes** accepted but reserved for future use
- **maxResults** caps per-relation output
- Each relation dispatched to appropriate substrate (semantic for references/implements, structural for callees)
- Best-effort per relation: unavailable substrates skip with a note rather than failing the entire call
- `imports`, `exports`, `tests` return "not yet implemented" gracefully
- File-level expansion not supported — requires precise target (anchored coords or targetId)

### `code_affected`
Semantic blast-radius tool. Uses semantic evidence. Does not fall back to heuristic search.

### `code_find`
Unified ranked code search with mode dispatch — the sole search tool.
- `query` (required) — search pattern or symbol query
- `mode?` — `text` (ripgrep literal, default), `regex` (ripgrep regex), `ast` (tree-sitter structured), `semantic` (LSP workspace symbols with text fallback)
- `kind?` — result filtering/ranking: `definition`, `import`, `export`, `call`, `type`, `test`. Advisory-only in text/regex modes (no filtering applied); supported kinds (`definition`, `export`, `import`) are applied directly in ast/semantic modes; `call`/`type`/`test` return "not yet implemented" for ast/semantic modes.
- `scope?` — workspace-relative path, package, or directory to limit search
- `contextLines?` — context lines around matches (default 1)
- `maxResults?` — result cap (default 8)

### `code_health`
Diagnostic health summary. Replaces `lsp_diagnostics` and `lsp_recover`.
- `scope?` — filter to a file or package path
- `refresh?` — recover stale diagnostics before checking
- `include?` — sections: diagnostics, servers, dirty
- `level?` — summary (counts) vs detailed (per-file)

### `code_resolve`
Resolve human or code references into precise file/range/symbol targets with stable handles. Supports anchored (file + line + character), file-only, and query/symbol inputs. Returns `targetId` and `spanId` for follow-up calls.

### `code_refactor_plan`
Preview-only operation-aware semantic refactor planning. Reads capability state from the shared broker, calls the semantic provider's operation-aware refactor entrypoint when available, validates the resulting precise workspace edit, computes file fingerprints for staleness detection, and returns a preview with a plan ID. Does not mutate files. May accept `targetId` in place of file/line/character.

First-wave supported operations:
- `rename_symbol`
- `update_imports`
- `delete_dead_code`
- legacy `rename` alias → `rename_symbol`

Deferred for a follow-up ticket:
- `rename_file`
- `move_file`

These deferred file/resource operations must stay explicit unavailable outcomes until the shared runtime supports real resource edits and rollback semantics.

### `code_refactor_apply`
Apply a previously generated refactor plan by plan ID. Retrieves the plan from the in-memory store, rechecks file fingerprints, re-validates ranges and overlap, applies deterministically through safety gates, and reports results. Rejects stale, missing, or invalid plans. In this phase it applies only stored, validated, precise text-edit plans.

## Key gotchas

### Planner routing
- The `planner.ts` central router reads capability state from the shared broker and returns `PlannerRoute` for each tool intent.
- `code_refactor_plan` checks `refactorAvailable` from the semantic capability slot.
- The semantic provider prefers its generic `refactor(request)` entrypoint; rename-only fallback exists only for compatibility with older provider shapes.
- `code_refactor_apply` does not require a live semantic provider — plan validity is enforced through fingerprint comparison in the executor.
- When no capability is available, the planner returns `preferred: "unavailable"` and the execute function returns an explicit error message.

### Public-surface split
- `code_find` is the sole search tool, supporting text, regex, AST, and semantic modes.
- `code_graph` dispatches each relation to the appropriate substrate. Unavailable substrates skip with a note rather than failing.

### Param validation
- `line`/`character` require `file`, **not** `path`.
- `code_refactor_plan` requires `operation` plus either `targetId` or `file` + `line` + `character`.
- `newName` is required for `rename_symbol` (and the legacy `rename` alias), but not for `update_imports` or `delete_dead_code`.
- `rename_file` / `move_file` are accepted at the schema level so the tool can return an explicit unavailable result rather than a misleading validation error.
- `code_refactor_apply` requires `planId`.
- `code_graph` requires `targetId`, `file` + `line` + `character`, or `symbol`. File-level expansion (file-only, no line/character) is not supported.
- `code_brief`, `code_affected` accept optional `targetId` that takes precedence over raw coordinates.

### Target resolution and handles
- Symbol discovery is semantic-only for non-search tools.
- File-level target expansion is allowed only when the required substrate can support it.
- The planner delegates to the existing targeting pipeline (`resolve-target.ts` and `src/targeting/*`).
- `code_resolve` registers targets in a session-scoped in-memory store (`src/workflow/target-store.ts`).
- Target IDs (`tg-*`) and span IDs (`sp-*`) are deterministic and stable while the backing file fingerprint is unchanged.
- Unknown or stale target IDs return explicit unavailable messages rather than silent fallthrough.
- No cross-session persistence — target handles live only as long as the current process.

### First-turn overview
- Injected via `before_agent_start` on the first turn; deduplicated via `hasInjectedOverview`.
- Uses `display: false` so the overview is agent-visible but TUI-invisible.
- On reload/resume, scans the branch for an existing `code-intelligence-overview` custom message.

### Refactor safety
- `validateEdit()` rejects empty edits and invalid ranges before filesystem apply.
- `code_refactor_plan` validates the edit before generating a plan; returns `unavailable` or `ambiguous` if the provider cannot produce precise edits.
- `code_refactor_apply` remains text-edit-only in this phase — do not extend it to file/resource operations until shared runtime support exists.
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
