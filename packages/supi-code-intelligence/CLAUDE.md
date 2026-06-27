# @mrclrchtr/supi-code-intelligence

Architecture briefs with structural enrichment, factual point inspection, reference/usages tracing, outgoing call analysis, implementation lookup, impact assessment, explicit search, and two-step semantic refactoring for pi.

Surfaces:
- `@mrclrchtr/supi-code-intelligence/extension` → `src/extension.ts` registers the focused public code-only tool surface (`code_orientation`, `code_inspect`, `code_graph`, `code_impact`, `code_find`, `code_health`, `code_resolve`, `code_refactor_plan`, `code_refactor_apply`)
- Historical substrate-named tools are no longer registered on the public surface as of Phase 1.5. The LSP and tree-sitter libraries remain as internal substrates.
- Installing this package activates only `code_*` tools
- Does **not** own a session-scoped cache or runtime service — reads capability state from the shared workspace broker (`@mrclrchtr/supi-code-runtime`)
- `@mrclrchtr/supi-code-intelligence/api` → `src/api.ts` / `src/index.ts` exposes reusable architecture helpers

## Architecture

```text
src/
├── code-intelligence.ts    # Extension factory — composition root over all internal layers
├── extension.ts            # Re-exports code-intelligence.ts for pi extension discovery
├── index.ts                # Public API exports for programmatic consumers
├── api.ts                  # Re-export surface for @mrclrchtr/supi-code-intelligence/api
├── types.ts                # Result metadata types (BriefDetails, InspectDetails, ContextDetails, SearchDetails, etc.)
├── architecture/
│   └── model.ts            # Project model builder for auto-injected overviews
├── project/
│   ├── git-context.ts      # Git branch, dirty files, last commit helpers
│   └── prioritization-signals.ts # Diagnostics, coverage, knip unused signals
├── intent/
│   └── types.ts            # Normalized intent and routing contracts (PlannerRoute, etc.)
├── targeting/              # Canonical targeting pipeline (resolve-anchored, resolve-file, resolve-symbol, types)
├── use-case/               # Typed orchestration modules (brief, brief-focused, build-overview, generate-*)
├── lsp/                    # LSP lifecycle, diagnostics, settings, tool overrides, workspace recovery
├── tree-sitter/            # Tree-sitter session lifecycle (substrate only)
├── app/
│   ├── create-code-intelligence-app.ts  # App composition root — wires pi events
│   └── workspace-manager.ts  # Per-cwd workspace session lifecycle
├── session/
│   ├── workspace-code-intelligence-session.ts  # Per-cwd session facade (ADR 0008)
│   └── target-store.ts     # Session-scoped target/span handle registry
├── analysis/
│   ├── helpers.ts           # Resolution/dedup helpers (isResolvedTargetGroup, highestConfidence)
│   ├── context/
│   │   └── request-context.ts  # Explicit analysis context over shared broker
│   ├── resolve/
│   │   ├── service.ts          # code_resolve business logic
│   │   └── resolve-file.ts     # File-only and path-like query resolution
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
│   │   ├── callees.ts          # Structural callee lookup
│   │   └── tests.ts            # Shared test discovery
│   ├── search/
│   │   ├── helpers.ts          # ripgrep wrapper, path normalization, URI helpers
│   │   └── pattern-structured.ts # Tree-sitter-based structured pattern search
│   └── refactor/
│       ├── safety.ts           # Edit validation
│       ├── apply-workspace-edit.ts # File mutation
│       └── plan-store.ts       # Two-step refactor plan storage
├── tool/
│   ├── tool-specs.ts           # Single source of truth for current public tool metadata
│   ├── guidance.ts             # Intent-first prompt surfaces from specs
│   ├── register-tools.ts       # Focused Pi tool registration (iterates over specs)
│   ├── validation.ts           # Shared parameter validation
│   ├── query-params.ts         # Shared CodeQueryParams type
│   ├── semantic-readiness.ts   # LSP warmup/readiness gating
│   ├── execute-context.ts      # code_orientation tool executor
│   ├── execute-inspect.ts      # code_inspect point-inspection executor
│   ├── execute-graph.ts        # code_graph tool executor (unified relations)
│   ├── execute-impact.ts       # code_impact tool executor
│   ├── execute-find.ts         # code_find tool executor
│   ├── execute-resolve.ts      # code_resolve tool executor
│   ├── execute-refactor-plan.ts  # preview refactor plan executor
│   └── execute-refactor-apply.ts # plan application executor
├── presentation/markdown/
│   ├── overview.ts             # Hidden overview markdown renderer
│   ├── context.ts              # code_orientation markdown renderer
│   ├── brief.ts                # Brief markdown renderer
│   ├── inspect.ts              # code_inspect markdown renderer
│   ├── relations.ts            # Relations markdown renderer (callers/callees/implementations)
│   ├── impact.ts               # Workflow impact markdown renderer
│   ├── pattern.ts              # Pattern/find search markdown renderer
│   ├── refactor.ts             # Refactor result markdown renderer
│   └── resolve.ts              # code_resolve markdown renderer (Phase 1)
│   └── health.ts               # code_health markdown renderer (Phase 1.5)
└── ui/
    ├── code-intelligence-status-command.ts  # /supi-ci-status command
    └── lsp-message-renderer.ts              # lsp-context custom message renderer
```

## Public tool contracts

### `code_orientation`
Primary orientation surface. Use it for first-pass project/module/directory/file orientation and for narrow symbol orientation after coordinates or `code_resolve`.

- accepts `focus`, `targetId`, `line`, `character`, and `maxResults`
- omit `focus` for workspace/project orientation
- `focus` is path-first and language-agnostic; if no path exists, discovered module-name lookup is attempted and ambiguity/errors are reported honestly
- `focus` + `line` + `character` resolves a real symbol target through the same provider-backed path as `code_resolve` and exposes a reusable `targetId` in `details.data.target`
- `targetId` takes precedence over `focus`/coordinates with a visible ignored-focus note; stale/invalid `targetId` errors and does not fall back
- symbol orientation renders definitions, JSDoc/TSDoc docs, local diagnostics near the target, and Read Next guidance
- relation/test evidence belongs to `code_graph`; impact evidence belongs to `code_impact`; full health/status belongs to `code_health`
- `maxResults` defaults to 10 and caps each rendered list independently
- `code_orientation` replaces `code_brief` and the old `code_context`; no compatibility alias is kept

### `code_inspect`
Factual point-inspection tool for one precise file position.

- requires `file`, `line`, and `character`
- returns best-effort syntax node / ancestry, enclosing symbol, hover/type info, definition targets, nearby diagnostics, code-action titles, and next recommended code tools
- when providers are missing, renders explicit unavailable sections instead of heuristic guesses
- keeps diagnostics summary and refresh on `code_health`; `code_inspect` only reports local facts near the inspected point

### `code_graph`
Unified relation-graph tool. Replaces `code_references`, `code_calls`, `code_implementations`.

- **targetId** (preferred from `code_resolve`) or file+line+character or symbol
- **relations**: `["all", "references", "callees", "imports", "exports", "implements", "tests"]` — default `["references"]`; use `["all"]` for the full graph in one call
- **maxResults** caps per-relation output
- Each relation dispatched to appropriate substrate (semantic for references/implements, structural for callees)
- Best-effort per relation: unavailable substrates skip with a note rather than failing the entire call
- `callees` reports direct structural outgoing calls from the enclosing executable scope at the target anchor. It matches call expressions by source shape, not symbol identity, and excludes calls inside nested function/method/callback scopes.
- `imports` and `exports` use file-level tree-sitter analysis; `tests` discovers companion tests using the shared helper in `src/analysis/relations/tests.ts`. Discovery combines semantic import/reference evidence with deterministic package-layout conventions (`__tests__/unit/…`, `__tests__/integration/…`, same-directory companions). `code_graph` and `code_impact` use the same discovery path — any divergence is a bug.
- Targeted graph output includes `Read Next` guidance for the resolved target, enclosing scope, or top relation sites when those source ranges are known
- File-level expansion not supported — requires precise target (anchored coords or targetId)

### `code_impact`
Preferred workflow-oriented blast-radius tool.

- supports target-based impact analysis plus user-supplied `changeSetFiles` input; `changeSetFiles` is not inferred from git and carries no line-level diff evidence
- explicit `includeTests` for companion test file discovery
- `change`-only requests return an explicit insufficient-evidence result instead of heuristic guessing
- target and change-set output includes `Read Next` guidance for source ranges worth inspecting before editing
- does not fall back to heuristic search

### `code_find`
Unified ranked code search with strict mode dispatch — the sole search tool.
- `query` (required) — search pattern or symbol query
- `mode?` — `text` (ripgrep literal, default), `regex` (ripgrep regex), `ast` (tree-sitter structured), `semantic` (LSP workspace symbols)
- omitted `mode` or `mode: "text"` allow literal text search only and do not accept `kind`
- `mode: "regex"` allows regex search only and does not accept `kind`
- `mode: "semantic"` allows semantic workspace-symbol search only, does not accept `kind`, and does not fall back to text search
- `mode: "ast"` requires explicit `kind`
- supported AST kinds: `definition`, `import`, `export`, `call`, `type`, `interface`, `class`, `method`, `enum`, `test`
- AST `call` mode matches call-site identifiers by name, not by symbol identity; use `code_graph` with `relations: ["references"]` on a resolved target for identity-aware callers
- unsupported combinations fail explicitly instead of widening into best-effort search
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

### `code_refactor_plan`
Pure refactor planner. Thin Phase 5 wrapper over the preview-only planning path.

- returns a preview plan with a plan ID; does not mutate files directly
- accepts the workflow schema (`operation`, optional `targetId`, anchored coords, and operation-specific fields)
- supported operations: `rename_symbol`, `extract_function`, `extract_variable`
- legacy `operation: "rename"` is accepted as a compatibility alias for `rename_symbol`
- extract operations require a 1-based `range`, `newName`, and an LSP code action that returns precise text edits

### `code_refactor_apply`
Sole mutator in the refactor workflow. Thin Phase 5 wrapper over the stored-plan application path.

- applies a previously generated plan by `planId`
- rechecks fingerprints and re-validates edit safety before mutation

## Internal compatibility executors

No compatibility aliases remain on the public refactor surface. `code_refactor_plan` and `code_refactor_apply` are the canonical public names.

## Always-on LSP policy

- The global `lsp.enabled` and `lsp.active` keys are **deprecated and ignored** since v0.7.0.
- LSP now always attempts to start detected servers — there is no global disable.
- Per-language disable via `lsp.servers.<language>.enabled: false` is the only supported opt-out.
- Deprecated keys are detected via `getDeprecatedLspKeys()` from `@mrclrchtr/supi-lsp/api`.
- Coverage warnings for degraded state (deprecated keys, missing servers, explicit disables, Tree-sitter failures) are computed by `src/lsp/coverage-warnings.ts` and surfaced in:
  - the /supi-ci-status overlay (as a "Degraded Coverage" section)
  - code_health (as a "Degraded Coverage" section)
  - a one-time chat-visible message after a short grace period (5s)

## TUI rendering

- `src/presentation/tui/` contains per-tool `renderCall` and `renderResult` for all 9 tools, wired in `register-tools.ts` via `getToolRenderer()`.
- **Dual-surface**: TUI body + chrome built from `details`; markdown `content` shown as `▸ raw markdown` collapsible detail. Never parse markdown in TUI renderers — body and chrome are independent consumers of the same evidence.
- `formatEvidenceBadge({ shownCount, totalCount, omittedCount, partialReason, label })` from `@mrclrchtr/supi-code-runtime/api` formats evidence completeness badges used in all tool result renderers.
- `evidenceKeyToLabel()` in `graph.ts` maps structured evidence keys (`references.locations`, `resolve.targets`, etc.) to human-readable labels. Add new keys there when they appear in tool details.
- **`renderShell: "self"` strips pi's Box background entirely.** Use default shell unless the tool needs full framing control. Return `Container`/`Text` from renderResult and pi wraps them in a Box with proper `toolSuccessBg`/`toolErrorBg`.

## Key gotchas

### Planner routing
- The `planner.ts` central router reads capability state from the shared broker and returns `PlannerRoute` for each tool intent.
- `code_orientation` uses the same semantic/structural preference model as `code_brief`, but its public contract is orientation-only: no `task`, `include`, `budget`, or `change`.
- `code_refactor_plan` checks `refactorAvailable` from the semantic capability slot.
- The semantic provider prefers its generic `refactor(request)` entrypoint; rename-only fallback exists only for compatibility with older provider shapes.
- `code_refactor_apply` does not require a live semantic provider — plan validity is enforced through fingerprint comparison in the executor.
- When no capability is available, the planner returns `preferred: "unavailable"`. The executors follow a 3-way throw policy:
  - **Throw** from `execute()` for whole-tool capability-unavailable — `route.preferred === "unavailable"` (no provider at all), or a provider that lacks the requested capability (e.g. refactor on a rename-only provider). pi marks the call `isError: true`. `code_find` already did this; `code_graph`, `code_resolve`, and `code_refactor_plan` were aligned to it.
  - **Return error text** for self-correctable invalid usage — missing target/params, bad `scope`, stale/invalid `targetId`, invalid `mode`/`kind`, malformed `range`. These stay `CodeIntelResult` with `details` so the model can correct and retry.
  - **Return best-effort notes** for per-relation/per-target partial unavailability — a `code_graph` relation whose substrate is down while another substrate serves the call, a `code_orientation` symbol section whose provider is unavailable, `code_resolve` ambiguous candidates. These do not throw.
  - Warmup timeouts stay error-text results (transient readiness, not capability-unavailable).

### Tool adapter contract
- The adapter in `register-tools.ts` head-truncates every executor's `content` string at pi defaults (2000 lines / 50 KB) via `truncateHead`, appending a `[truncated: kept N of M lines (X of Y)]` notice. `details` are never truncated. Per‑spec `maxLines`/`maxBytes` overrides are available on `CodeIntelligenceToolDefinitionSpec`. When `spillToTempFile: true` and truncation occurs, the full content is written to a temp file and the path is appended to the truncation notice.
- The adapter forwards `signal` (AbortSignal) and `onUpdate` (AgentToolUpdateCallback) from pi's `execute()` through `spec.run` into every executor's `CodeIntelToolExecCtx`. Long‑running executors (`code_find` ripgrep, `code_graph:all`, `code_impact` sweeps, `code_health:refresh`, `code_refactor_plan` LSP requests) forward `signal` to abort‑aware sub‑processes and emit coarse `onUpdate` progress beats via `emitToolProgress`.

### Public-surface split
- `code_orientation` is now active as the orientation surface; `code_brief` and the old `code_context` public surface have been removed.
- `code_inspect` is the explicit public point-inspection tool.
- `code_impact` is now active as the preferred workflow impact surface.
- `code_find` is the sole search tool, supporting text, regex, AST, and semantic modes.
- `code_graph` dispatches each relation to the appropriate substrate. Unavailable substrates skip with a note rather than failing.
- `code_refactor_plan` / `code_refactor_apply` are now active as the preferred workflow refactor/apply surfaces.

### Param validation
- `code_inspect` requires `file` + `line` + `character`.
- For `code_orientation`, `line`/`character` require `focus`. For other coordinate tools, `line`/`character` require `file`, **not** `scope`.
- `code_refactor_plan` requires `operation` plus either `targetId` or `file` + `line` + `character`.
- `newName` is required for `rename_symbol`, `extract_function`, and `extract_variable` (and for the legacy `rename` alias on `code_refactor_plan`).
- `range` is required for `extract_function` and `extract_variable`; public range coordinates are 1-based and converted to LSP ranges internally.
- `code_refactor_apply` requires `planId`.
- `code_graph` requires `targetId`, `file` + `line` + `character`, or `symbol`. File-level expansion (file-only, no line/character) is not supported.
- `code_orientation` accepts `targetId` or `focus` + `line` + `character` for precise symbol orientation. `targetId` takes precedence over focus/coordinates with a visible note; a stale/invalid `targetId` errors and does not fall back. Coordinate mode requires all three fields when any is present and `focus` must be a file path.
- `code_orientation`, `code_impact`, and `code_refactor_plan` accept optional `targetId` that takes precedence over raw coordinates.
- `focus` is the orientation selection input for `code_orientation`; other tools keep `scope` for narrowing/filtering.

### Composite provider contract
- `createCompositeProvider` in `src/analysis/context/request-context.ts` wraps `StructuralProvider` and `SemanticProvider` into a single `CodeProvider`. **When you add a new parameter to any provider method, update the composite wrapper to accept and pass it through.** Missing parameters are silently dropped — the wrapper uses `?` optional params, so TypeScript won't catch the mismatch at runtime (the extra argument is simply ignored).

### Evidence provenance in test discovery
- Test discovery results carry `provenance`: `"semantic+conventions"` if semantic references contributed files, `"conventions-only"` otherwise.
- This provenance describes **file discovery only**. It must not imply whether test labels were extracted.
- `code_graph` and `code_impact` display provenance annotations in their output.
- Structured tool details for those surfaces also carry a compact tests metadata shape: discovery status/provenance plus per-file label status and extracted labels.
- In `code_impact`, likely-test headings annotate discovery provenance symmetrically: `Likely Tests (semantic+conventions)` when semantic discovery contributed, `Likely Tests (conventions-only)` when only conventions contributed.
- A `conventions-only` result with zero test files is treated as `unavailable` by `code_graph` only when neither semantic references nor structural outline support is available; otherwise it is an honest empty result.
- User-facing test-label output includes only recognized `` describe ``/`` it ``/`` test ``/`` spec `` blocks from provider-backed or conservative fallback extraction. Helper names like `tmpDir`, `result`, `writeSource` are not rendered.
- A discovered test file with zero recognized test blocks displays `_(no recognized test blocks)_`. This placeholder is intentional honesty, not missing rendering.

### Evidence in changeSetFiles impact
- `code_impact` with `changeSetFiles` appends an evidence note. It reports `semantic+structural` when semantic references for symbols defined in change-set files contributed, otherwise `structural` for file-level module analysis and path-based test discovery.

### Shared test discovery
- `src/analysis/relations/tests.ts` is the single source of truth for test-file discovery. `code_graph` and `code_impact` route through `discoverTestFilesForSource()`. Any divergent test lookup logic in a tool file is a bug.
- Discovery combines semantic import/reference evidence with deterministic path conventions: same-directory companions, same-directory `__tests__/` companions, package-level mirrors (`__tests__/unit/…`, `__tests__/integration/…`), and bounded tool/package-aware candidates. For source files at `src/tool/execute-<name>.ts`, exact candidates such as `code-<name>-tool`, `<name>-tool`, and `execute-<name>` are checked in both `__tests__/unit/` and `__tests__/integration/` with `.test` and `.spec` suffixes. No broad search, fuzzy matching, or AI guessing is performed.

### Impact seeding
- Target-based `code_impact` seeds the target file itself as affected evidence. A symbol with zero semantic references still reports its own file as affected and can discover likely tests through the shared test-discovery helper.
- `code_impact` with `includeTests: true` emits `likelyTestCommands` only when the workspace clearly uses Vitest (for example via package metadata, scripts, or a Vitest config file).
- When `includeTests: true` is set and bounded companion/package discovery completes without finding any test files, `code_impact` renders an explicit `No likely tests found by bounded companion/package discovery.` note instead of silently omitting test information. This note is gated on the presence of tests metadata (present only when discovery was attempted).

### Target resolution and handles
- Symbol discovery is semantic-only for non-search tools.
- File-level target expansion is allowed only when the required substrate can support it.
- The planner delegates to the existing targeting pipeline (`resolve-target.ts` and `src/targeting/*`).
- `code_resolve` registers targets in a session-scoped in-memory store (`src/workflow/target-store.ts`).
- Anchored `code_resolve({ file, line, character })` resolves a **real symbol target** from provider-backed evidence via `resolveAnchoredSymbolTarget` (`src/targeting/resolve-anchored.ts`): exact identifier hit → named `name` anchor; declaration-header coordinate → snaps to the name anchor only when one provider-backed symbol is unambiguous (with a visible note + structured resolution metadata); whitespace/comment/non-symbol coordinates error and recommend `code_inspect`. It does **not** register anonymous point targets.
- `code_orientation` coordinate mode (`focus` + `line` + `character`) reuses the same anchored resolution + store path as `code_resolve` (via `executeResolveService`), so a one-call orientation result exposes a reusable `targetId`.
- `code_graph` and `code_impact` coordinate mode (`file` + `line` + `character`) routes through `resolveTarget` (`src/analysis/targeting/resolve-target.ts`), whose anchored case calls the same `resolveAnchoredSymbolTarget` — all four target-oriented tools share one provider-backed symbol resolver and never produce anonymous `name:null` point targets (ADR 0003). The legacy sync `resolveAnchoredTarget` point-target resolver has been removed.
- Target IDs (`tg-*`) and span IDs (`sp-*`) are deterministic and stable while the backing file fingerprint is unchanged. Per ADR 0003, position is excluded from the `targetId` identity hash (name/kind/container/fingerprint), so re-resolving the same symbol reuses the same ID regardless of anchor refine success.
- Unknown or stale target IDs return explicit unavailable messages rather than silent fallthrough. `code_orientation` and `code_graph` do **not** fall back to coordinates when a `targetId` is stale/invalid.
- No cross-session persistence — target handles live only as long as the current process.

### First-turn overview
- Injected via `before_agent_start` on the first turn; deduplicated via `hasInjectedOverview`.
- Uses `display: false` so the overview is agent-visible but TUI-invisible.
- On reload/resume, scans the branch for an existing `code-intelligence-overview` custom message.

### Refactor safety
- `validateEdit()` rejects empty edits and invalid ranges before filesystem apply.
- `code_refactor_plan` validates the edit before generating a plan; it **throws** for `unavailable` (provider cannot produce precise edits) and returns an `ambiguous` result (text + candidates) when multiple targets match.
- `code_refactor_apply` remains text-edit-only in this phase — do not extend it to file/resource operations until shared runtime support exists.
- `code_refactor_apply` rejects stale plans by comparing stored SHA-256 file fingerprints to current contents, and re-validates ranges before applying.
- `code_refactor_apply` acquires pi's per‑file `withFileMutationQueue` for every involved file in sorted path order before reading original contents, building transformed contents, and committing (ADR 0006). Cross‑file rollback is preserved; no `executionMode` change.
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
