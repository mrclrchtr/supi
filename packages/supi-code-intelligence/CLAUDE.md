# @mrclrchtr/supi-code-intelligence

Architecture briefs with structural enrichment, factual point inspection, reference/usages tracing, outgoing call analysis, implementation lookup, impact assessment, explicit search, and two-step semantic refactoring for pi.

Surfaces:
- `@mrclrchtr/supi-code-intelligence/extension` → `src/extension.ts` registers the focused public code-only tool surface (`code_context`, `code_inspect`, `code_graph`, `code_impact`, `code_find`, `code_health`, `code_resolve`, `code_refactor`, `code_apply`)
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
├── types.ts                # Result metadata types (BriefDetails, InspectDetails, ContextDetails, SearchDetails, etc.)
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
│   ├── target-id-params.ts     # targetId expansion/lookup helpers (Phase 1)
│   ├── execute-context.ts      # code_context tool executor
│   ├── execute-inspect.ts      # code_inspect point-inspection executor
│   ├── execute-graph.ts        # code_graph tool executor (unified relations)
│   ├── execute-impact.ts       # code_impact tool executor (preferred impact surface)
│   ├── execute-find.ts         # code_find tool executor
│   ├── execute-resolve.ts      # code_resolve tool executor (Phase 1)
│   ├── execute-refactor.ts     # code_refactor workflow wrapper (Phase 5)
│   ├── execute-apply.ts        # code_apply workflow wrapper (Phase 5)
│   ├── execute-refactor-plan.ts  # preview refactor plan executor (internal substrate)
│   └── execute-refactor-apply.ts # plan application executor (internal substrate)
├── workflow/
│   ├── names.ts               # Canonical V2 workflow tool names (all active)
│   ├── ids.ts                 # Planned V2 workflow handle contracts (TargetId, PlanId, etc.)
│   ├── results.ts             # Shared structured result envelope and provenance types
│   ├── schemas.ts             # Planned V2 workflow tool parameter schemas
│   ├── surface.ts             # Canonical V2 tool metadata (all active)
│   ├── target-store.ts        # Session-scoped target/span handle registry (Phase 1)
│   └── index.ts               # Internal barrel for workflow skeleton consumers/tests
├── presentation/markdown/
│   ├── overview.ts             # Hidden overview markdown renderer
│   ├── context.ts              # code_context markdown renderer
│   ├── brief.ts                # Brief markdown renderer
│   ├── inspect.ts              # code_inspect markdown renderer
│   ├── relations.ts            # Relations markdown renderer (callers/callees/implementations)
│   ├── impact.ts               # Preferred workflow impact markdown renderer
│   ├── affected.ts             # code_affected compatibility markdown renderer
│   ├── pattern.ts              # Pattern/find search markdown renderer
│   ├── refactor.ts             # Refactor result markdown renderer
│   └── resolve.ts              # code_resolve markdown renderer (Phase 1)
│   └── health.ts               # code_health markdown renderer (Phase 1.5)
└── ui/
    ├── code-intelligence-status-command.ts  # /supi-ci-status command
    └── lsp-message-renderer.ts              # lsp-context custom message renderer
```

## Public tool contracts

### `code_context`
Task-focused context bundle. It is the solo surface for both orientation and task-focused coding context — `code_brief` has been merged into it.

- accepts `task`, `targetId`, `scope`, `budget`, `include`, and `maxResults`
- when `task` is omitted, returns a neutral orientation brief (project, package, directory, file, or symbol overview)
- when `task` is present, renders only the requested sections and reports unavailable sections honestly
- `targetId` from `code_resolve` is the preferred precise anchor for task-focused follow-up
- first-wave docs/tests/diagnostics sections are best-effort and must stay explicit when empty or unavailable

**Orientation briefs** — When called without `task`:
- **Enriched file briefs** — outline (top-level declarations), imports, exports, diagnostics
- **Enriched module briefs** — aggregate diagnostics across source files when LSP is active
- **Directory brief enrichment** — extension breakdown, landmark files
- **Symbol briefs** — orientation-focused, not inspect-style

**`maxResults`** — Controls section caps: outline items (default 15), imports (default 10), exports (default 10), diagnostic messages (default 5), source file listings (default 10). When omitted, defaults apply.

### `code_inspect`
Factual point-inspection tool for one precise file position.

- requires `file`, `line`, and `character`
- returns best-effort syntax node / ancestry, enclosing symbol, hover/type info, definition targets, nearby diagnostics, code-action titles, and next recommended code tools
- when providers are missing, renders explicit unavailable sections instead of heuristic guesses
- keeps diagnostics summary and refresh on `code_health`; `code_inspect` only reports local facts near the inspected point

### `code_graph`
Unified relation-graph tool. Replaces `code_references`, `code_calls`, `code_implementations`.

- **targetId** (preferred from `code_resolve`) or file+line+character or symbol
- **relations**: `["references", "callees", "imports", "exports", "implements", "tests"]` — default `["references"]`
- **maxResults** caps per-relation output
- Each relation dispatched to appropriate substrate (semantic for references/implements, structural for callees)
- Best-effort per relation: unavailable substrates skip with a note rather than failing the entire call
- `imports` and `exports` use file-level tree-sitter analysis; `tests` discovers companion tests using the shared helper in `src/analysis/relations/tests.ts`. Discovery combines semantic import/reference evidence with deterministic package-layout conventions (`__tests__/unit/…`, `__tests__/integration/…`, same-directory companions). `code_graph`, `code_context`, and `code_impact` all use the same discovery path — any divergence is a bug.
- File-level expansion not supported — requires precise target (anchored coords or targetId)

### `code_impact`
Preferred workflow-oriented blast-radius tool.

- supports target-based impact analysis plus diff-aware `changedFiles` input
- explicit `includeTests` for companion test file discovery
- `change`-only requests return an explicit insufficient-evidence result instead of heuristic guessing
- does not fall back to heuristic search

### `code_find`
Unified ranked code search with strict mode dispatch — the sole search tool.
- `query` (required) — search pattern or symbol query
- `mode?` — `text` (ripgrep literal, default), `regex` (ripgrep regex), `ast` (tree-sitter structured), `semantic` (LSP workspace symbols)
- omitted `mode` or `mode: "text"` allow literal text search only and do not accept `kind`
- `mode: "regex"` allows regex search only and does not accept `kind`
- `mode: "semantic"` allows semantic workspace-symbol search only, does not accept `kind`, and does not fall back to text search
- `mode: "ast"` requires explicit `kind`
- supported AST kinds in this phase: `definition`, `import`, `export`
- unsupported combinations fail explicitly; `call`, `type`, and `test` are not supported AST kinds in this phase
- `scope?` — workspace-relative path, package, or directory to limit search
- `contextLines?` — context lines around matches (default 1)
- `maxResults?` — result cap (default 8)

### `code_health`
Diagnostic health summary. Replaces `lsp_diagnostics` and `lsp_recover`.
- `scope?` — filter to a file or package path
- `refresh?` — recover stale diagnostics before checking
- `include?` — sections: diagnostics, servers, dirty, coverage, unused
- `coverage` reads `coverage/coverage-summary.json` when requested and reports low-coverage files
- `unused` reads `knip.json` when requested and reports unused files/exports
- missing requested coverage/unused reports are reported explicitly instead of silently falling back to diagnostics
- `level?` — summary (counts) vs detailed (per-file)

### `code_resolve`
Resolve human or code references into precise file/range/symbol targets with stable handles. Supports anchored (file + line + character), file-only, and query/symbol inputs. Returns `targetId` and `spanId` for follow-up calls.

### `code_refactor`
Preferred workflow refactor surface. Thin Phase 5 wrapper over the preview-only planning path.

- returns a preview plan with a plan ID; does not mutate files directly
- accepts the workflow schema (`operation`, optional `targetId`, anchored coords, and operation-specific fields)
- supported operation in this phase: `rename_symbol`
- legacy `operation: "rename"` is accepted as a compatibility alias for `rename_symbol`
- `preview: false` is not yet supported; `code_refactor` remains preview-only in this phase

### `code_apply`
Preferred workflow apply surface. Thin Phase 5 wrapper over the stored-plan application path.

- applies a previously generated plan by `planId`
- supports only `mode: "apply"` in this phase
- rechecks fingerprints and re-validates edit safety before mutation

## Internal compatibility executors

The legacy compatibility executors (`code_refactor_plan`, `code_refactor_apply`) remain as internal substrates for `code_refactor` and `code_apply` respectively, but are no longer registered on the public tool surface.

## Key gotchas

### Planner routing
- The `planner.ts` central router reads capability state from the shared broker and returns `PlannerRoute` for each tool intent.
- `code_context` uses the same semantic/structural preference model as `code_brief`, but falls back to orientation-style output when `task` is omitted.
- `code_refactor` and `code_refactor_plan` check `refactorAvailable` from the semantic capability slot.
- The semantic provider prefers its generic `refactor(request)` entrypoint; rename-only fallback exists only for compatibility with older provider shapes.
- `code_apply` and `code_refactor_apply` do not require a live semantic provider — plan validity is enforced through fingerprint comparison in the executor.
- When no capability is available, the planner returns `preferred: "unavailable"` and the execute function returns an explicit error message.

### Public-surface split
- `code_context` is now active as the solo task-focused and orientation surface; `code_brief` has been removed from the public surface.
- `code_inspect` is the explicit public point-inspection tool.
- `code_impact` is now active as the preferred workflow impact surface.
- `code_find` is the sole search tool, supporting text, regex, AST, and semantic modes.
- `code_graph` dispatches each relation to the appropriate substrate. Unavailable substrates skip with a note rather than failing.
- `code_refactor` / `code_apply` are now active as the preferred workflow refactor/apply surfaces.

### Param validation
- `code_inspect` requires `file` + `line` + `character`.
- `line`/`character` require `file`, **not** `scope`.
- `code_refactor` requires `operation` plus either `targetId` or `file` + `line` + `character`.
- `newName` is required for `rename_symbol` (and for the legacy `rename` alias on `code_refactor`).
- `code_apply` requires `planId`.
- `code_graph` requires `targetId`, `file` + `line` + `character`, or `symbol`. File-level expansion (file-only, no line/character) is not supported.
- `code_context`, `code_impact`, and `code_refactor` accept optional `targetId` that takes precedence over raw coordinates.
- `code_context` accepts optional `targetId` for orientation-only follow-up.

### Evidence provenance in test discovery
- Test discovery results carry `provenance`: `"semantic+conventions"` if semantic references contributed files, `"conventions-only"` otherwise.
- This provenance describes **file discovery only**. It must not imply whether test labels were extracted.
- `code_graph`, `code_context`, and `code_impact` all display provenance annotations in their output.
- Structured tool details for those surfaces also carry a compact tests metadata shape: discovery status/provenance plus per-file label status and extracted labels.
- In `code_impact`, likely-test headings annotate discovery provenance symmetrically: `Likely Tests (semantic+conventions)` when semantic discovery contributed, `Likely Tests (conventions-only)` when only conventions contributed.
- A `conventions-only` result with zero test files is treated as `unavailable` by `code_graph` only when neither semantic references nor structural outline support is available; otherwise it is an honest empty result.
- User-facing test-label output includes only recognized `` describe ``/`` it ``/`` test ``/`` spec `` blocks from provider-backed or conservative fallback extraction. Helper names like `tmpDir`, `result`, `writeSource` are not rendered.
- A discovered test file with zero recognized test blocks displays `_(no recognized test blocks)_`. This placeholder is intentional honesty, not missing rendering.

### Evidence in changedFiles impact
- `code_impact` with `changedFiles` always appends `**Evidence: structural**` to its output. changedFiles analysis is structurally limited to file-level module analysis and path-based test discovery.

### Shared test discovery
- `src/analysis/relations/tests.ts` is the single source of truth for test-file discovery. `code_graph`, `code_context`, and `code_impact` all route through `discoverTestFilesForSource()`. Any divergent test lookup logic in a tool file is a bug.
- Discovery combines semantic import/reference evidence with deterministic path conventions: same-directory companions, same-directory `__tests__/` companions, and package-level mirrors (`__tests__/unit/…`, `__tests__/integration/…`).

### Impact seeding
- Target-based `code_impact` seeds the target file itself as affected evidence. A symbol with zero semantic references still reports its own file as affected and can discover likely tests through the shared test-discovery helper.
- `code_impact` with `includeTests: true` emits `likelyTestCommands` only when the workspace clearly uses Vitest (for example via package metadata, scripts, or a Vitest config file).

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
- `code_refactor` / `code_refactor_plan` validate the edit before generating a plan; they return `unavailable` or `ambiguous` if the provider cannot produce precise edits.
- `code_apply` / `code_refactor_apply` remain text-edit-only in this phase — do not extend them to file/resource operations until shared runtime support exists.
- `code_apply` / `code_refactor_apply` reject stale plans by comparing stored SHA-256 file fingerprints to current contents, and re-validate ranges before applying.
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
