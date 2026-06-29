## Approved design

### Goal
Restructure `packages/supi-code-intelligence` into explicit internal layers while keeping `@mrclrchtr/supi-code-intelligence` as the **only** pi extension exposer for the code-understanding stack. `@mrclrchtr/supi-lsp` and `@mrclrchtr/supi-tree-sitter` remain published, library-only packages.

### Scope check
This stays as **one coherent refactor plan** rather than multiple independent tickets because the changes all serve the same outcome:
- make `supi-code-intelligence` the sole pi-facing adapter layer
- remove transitional ownership drift and duplicated tool-edge logic
- make request/context flow explicit
- give `supi-code-intelligence` a modular internal layout that matches repo conventions

This plan does **not** introduce a new publishable package. It is an internal modularization of `packages/supi-code-intelligence` plus the minimum substrate-library cleanup required to support that boundary cleanly.

### Locked decisions
- `@mrclrchtr/supi-code-intelligence` remains the only package in this stack with a `pi.extensions` surface.
- `@mrclrchtr/supi-lsp` remains a semantic runtime library only.
- `@mrclrchtr/supi-tree-sitter` remains a structural runtime library only.
- Public tool names stay unchanged: `code_*`, `lsp_*`, and `tree_sitter_*` remain the model-facing surface.
- This refactor keeps lower-level expert tools available as secondary debug surfaces; it does not require deleting `lsp_references`, `lsp_implementation`, or `tree_sitter_callees`.
- No new `supi-code-analysis` package is introduced.
- The refactor favors compatibility shims at existing entrypoints over a flag-day rename of all internal imports.
- `@mrclrchtr/supi-code-runtime` remains the canonical workspace capability broker for semantic and structural availability. `workspace-session` in `supi-code-intelligence` coordinates local overview/model-cache/adapter state around that broker; it does **not** replace it.
- Compatibility shims at existing `src/use-case/*`, `src/tool/*`, `src/lsp/*`, `src/tree-sitter/*`, and `src/refactor/*` entrypoints are acceptable during the migration as long as the new ownership anchors stay explicit.

### Architectural direction
`packages/supi-code-intelligence` should become a composition root over five internal layers:

1. **App layer** — extension composition, workspace session state, feature wiring
2. **Substrate layer** — the only place that integrates directly with `@mrclrchtr/supi-lsp/api` and `@mrclrchtr/supi-tree-sitter/api`; it may publish capability state into the shared `@mrclrchtr/supi-code-runtime` broker but must not create a competing broker
3. **Analysis layer** — architecture model, request context, routing, targeting, and typed domain services for `code_*`; it consumes explicit request context instead of hidden runtime singleton lookups
4. **Tool layer** — family-specific metadata, guidance, registration, and thin execution adapters for `code_*`, `lsp_*`, and `tree_sitter_*`
5. **Presentation/UI layer** — markdown renderers, custom message renderers, and TUI/status surfaces

The dependency direction should be:
- `app` depends on `substrate`, `tool`, `presentation`, and `ui`
- `tool` depends on `analysis`, `substrate`, and `presentation`
- `analysis` depends on provider interfaces / explicit request context, never on pi APIs, controller classes, or broker-singleton lookups hidden inside deep modules
- `substrate` owns runtime-controller / registry integration and any branch/session state
- `presentation` and `ui` stay free of business logic beyond rendering and display-state shaping

### Target source layout
The refactor should move `packages/supi-code-intelligence/src/` toward this shape:

```text
src/
  extension.ts
  code-intelligence.ts
  api.ts
  index.ts
  app/
    create-code-intelligence-app.ts
    workspace-manager.ts
    workspace-session.ts
  substrate/
    semantic/
      lifecycle.ts
      diagnostics.ts
      recovery.ts
      settings.ts
      overrides.ts
      state.ts
    structural/
      lifecycle.ts
      state.ts
  analysis/
    context/
      request-context.ts
    architecture/
      model-service.ts
      model-cache.ts
    routing/
      planner.ts
    targeting/
      types.ts
      normalize-query.ts
      resolve-target.ts
      disambiguation.ts
    brief/
      service.ts
    map/
      service.ts
    relations/
      types.ts
      service.ts
      callers.ts
      implementations.ts
      callees.ts
    affected/
      service.ts
    pattern/
      service.ts
    refactor/
      service.ts
      safety.ts
      apply-workspace-edit.ts
  tool/
    common/
      register-family.ts
      validation.ts
    families/
      code/
        specs.ts
        guidance.ts
        register.ts
        execute.ts
      lsp/
        specs.ts
        guidance.ts
        register.ts
        execute.ts
        format.ts
      tree-sitter/
        specs.ts
        guidance.ts
        register.ts
        execute.ts
        format.ts
  presentation/
    markdown/
      overview.ts
      brief.ts
      map.ts
      relations.ts
      affected.ts
      pattern.ts
      refactor.ts
  ui/
    code-intelligence-status-command.ts
    code-intelligence-status-view.ts
    lsp-message-renderer.ts
```

### File mapping and responsibilities
The implementation should treat these files as the new ownership anchors:

#### App layer
- `packages/supi-code-intelligence/src/code-intelligence.ts` — stays the package composition root, but becomes thin
- `packages/supi-code-intelligence/src/app/create-code-intelligence-app.ts` — creates the app object and wires feature registration
- `packages/supi-code-intelligence/src/app/workspace-manager.ts` — owns per-cwd workspace session instances
- `packages/supi-code-intelligence/src/app/workspace-session.ts` — owns local session-scoped app state (overview injection, model cache, semantic/structural adapter state) around the shared `supi-code-runtime` broker

#### Substrate integration
- `packages/supi-code-intelligence/src/substrate/semantic/lifecycle.ts` — LSP session lifecycle wiring
- `packages/supi-code-intelligence/src/substrate/semantic/diagnostics.ts` — LSP diagnostic injection/message behavior
- `packages/supi-code-intelligence/src/substrate/semantic/recovery.ts` — LSP workspace recovery behavior
- `packages/supi-code-intelligence/src/substrate/semantic/settings.ts` — LSP settings registration owned by the umbrella extension
- `packages/supi-code-intelligence/src/substrate/semantic/overrides.ts` — LSP-aware read/write/edit tool overrides owned by the umbrella extension
- `packages/supi-code-intelligence/src/substrate/semantic/state.ts` — semantic adapter/session state
- `packages/supi-code-intelligence/src/substrate/structural/lifecycle.ts` — Tree-sitter session lifecycle wiring
- `packages/supi-code-intelligence/src/substrate/structural/state.ts` — structural adapter/session state

#### Analysis layer
- `packages/supi-code-intelligence/src/analysis/context/request-context.ts` — explicit analysis request context builder over the shared broker snapshot plus workspace-session-local caches; replaces hidden runtime lookups inside deep modules
- `packages/supi-code-intelligence/src/analysis/architecture/model-service.ts` — canonical architecture-model service
- `packages/supi-code-intelligence/src/analysis/architecture/model-cache.ts` — session/workspace cache and invalidation hooks for architecture models
- `packages/supi-code-intelligence/src/analysis/routing/planner.ts` — routing decisions based on explicit capability state
- `packages/supi-code-intelligence/src/analysis/targeting/resolve-target.ts` — unified target-resolution facade
- `packages/supi-code-intelligence/src/analysis/targeting/disambiguation.ts` — one place for disambiguation shaping/formatting support
- `packages/supi-code-intelligence/src/analysis/{brief,map,affected,pattern,refactor}/service.ts` — typed domain services
- `packages/supi-code-intelligence/src/analysis/relations/types.ts` — typed result and evidence shapes for `code_relations`
- `packages/supi-code-intelligence/src/analysis/relations/service.ts` — dispatches `code_relations` by kind
- `packages/supi-code-intelligence/src/analysis/relations/callers.ts` — semantic caller/reference collection with file-group expansion and evidence metadata
- `packages/supi-code-intelligence/src/analysis/relations/implementations.ts` — semantic implementation lookup
- `packages/supi-code-intelligence/src/analysis/relations/callees.ts` — structural callee lookup

#### Tool layer
- `packages/supi-code-intelligence/src/tool/common/register-family.ts` — shared registration helper
- `packages/supi-code-intelligence/src/tool/common/validation.ts` — shared validation primitives
- `packages/supi-code-intelligence/src/tool/families/code/*` — `code_*` metadata + execution
- `packages/supi-code-intelligence/src/tool/families/code/execute-relations.ts` — thin `code_relations` tool edge (validate → build context → service → render)
- `packages/supi-code-intelligence/src/tool/families/lsp/*` — `lsp_*` metadata + execution
- `packages/supi-code-intelligence/src/tool/families/tree-sitter/*` — `tree_sitter_*` metadata + execution

#### Presentation/UI layer
- `packages/supi-code-intelligence/src/presentation/markdown/*.ts` — markdown-only renderers over typed analysis results
- `packages/supi-code-intelligence/src/ui/lsp-message-renderer.ts` — `lsp-context` custom message renderer
- `packages/supi-code-intelligence/src/ui/code-intelligence-status-command.ts` — umbrella status command wired to the new app/session state
- `packages/supi-code-intelligence/src/ui/code-intelligence-status-view.ts` — TUI/status rendering surface

#### Compatibility shims
Existing roots should remain as thin forwarders while the internals move:
- `packages/supi-code-intelligence/src/brief.ts`
- `packages/supi-code-intelligence/src/model.ts`
- `packages/supi-code-intelligence/src/resolve-target.ts`
- `packages/supi-code-intelligence/src/target-resolution.ts`
- `packages/supi-code-intelligence/src/api.ts`
- `packages/supi-code-intelligence/src/index.ts`
- `packages/supi-code-intelligence/src/refactor/safety.ts`
- `packages/supi-code-intelligence/src/refactor/apply-workspace-edit.ts`
- `packages/supi-code-intelligence/src/use-case/generate-brief.ts`
- `packages/supi-code-intelligence/src/use-case/generate-map.ts`
- `packages/supi-code-intelligence/src/use-case/generate-relations.ts`
- `packages/supi-code-intelligence/src/use-case/generate-affected.ts`
- `packages/supi-code-intelligence/src/use-case/generate-pattern.ts`
- `packages/supi-code-intelligence/src/use-case/types.ts`

Current `src/tool/execute-*.ts`, `src/lsp/*`, and `src/tree-sitter/*` files may also survive temporarily as thin forwarders while imports migrate, but they are no longer the ownership anchors.

### Substrate library cleanup
To keep `supi-lsp` and `supi-tree-sitter` truly library-only:
- `packages/supi-lsp` should continue exposing runtime/service/provider APIs only; all pi-facing UX remains in `supi-code-intelligence`
- `packages/supi-tree-sitter` should expose structured services/provider adapters only; expert-tool string formatting / handler-style wrappers should move fully into `supi-code-intelligence`
- `packages/supi-tree-sitter/src/api.ts` and `packages/supi-tree-sitter/src/index.ts` should stop advertising tool-edge handler exports once the umbrella no longer depends on them

### Service/output rule
The `analysis/` layer should return **typed data**, not assembled markdown strings. The `tool/` and `presentation/` layers should follow this shape:

`validate params → build request context → call analysis/substrate service → render output → return details`

That keeps domain logic reusable and testable while preserving the current tool UX.

Public result metadata in `src/types.ts` / `src/api.ts` / `src/index.ts` should represent relation-specific evidence and omission data explicitly rather than squeezing everything into generic search metadata.

### Focused tool design note — `code_relations`
`code_relations` is the preferred high-level relationship tool inside the modularized stack.

- The planner should route `kind: "callers"` and `kind: "implementations"` to the semantic provider and `kind: "callees"` to the structural provider.
- Validation should make the per-kind contract explicit: file-level expansion is allowed only for `kind: "callers"`; `callees` and `implementations` require anchored coordinates or `symbol` discovery.
- The analysis implementation should be split into `callers.ts`, `implementations.ts`, and `callees.ts`, with `service.ts` acting only as the dispatcher.
- `callers` results must carry explicit evidence metadata such as `"semantic-references"` vs `"verified-call-sites"` so renderers can stay honest when semantic references are used as caller evidence.
- `packages/supi-code-intelligence/src/presentation/markdown/relations.ts` should remain a pure renderer over typed `RelationsResult` data; it must not perform routing, provider calls, or target resolution.
- Keep `lsp_references`, `lsp_implementation`, and `tree_sitter_callees` available as secondary debug surfaces during this refactor. `code_relations` is the preferred model-facing surface, but this ticket does not require deleting the lower-level expert tools.

### Required docs alignment
The refactor changes package ownership and internal structure, so the implementation must update:
- `docs/package-layout.md`
- `docs/tool-architecture.md`
- `packages/supi-code-intelligence/README.md`
- `packages/supi-code-intelligence/CLAUDE.md`
- `packages/supi-lsp/README.md`
- `packages/supi-lsp/CLAUDE.md`
- `packages/supi-tree-sitter/README.md`
- `packages/supi-tree-sitter/CLAUDE.md`

### Non-goals
- Do not rename public tool names.
- Do not move runtime code back into substrate extension surfaces.
- Do not create a new package just to host internal analysis modules.
- Do not widen the scope into unrelated LSP or Tree-sitter feature work beyond what is needed to cleanly enforce the new boundaries.
- Do not replace the shared capability broker in `@mrclrchtr/supi-code-runtime` with a second registry inside `supi-code-intelligence`.

### Implementation hints

#### Task sizing
Tasks 3 and 4 each touch 40–50+ files. Within each task, follow this order of operations to stay incremental:
1. Write the RED tests first.
2. Create the new analysis/presentation/tool modules.
3. Wire the new modules into the app composition root.
4. Reduce old entrypoints to forwarders.
5. Update remaining test files.
6. Run the full per-task verification command.

#### pnpm install after structural changes
When files move directories (especially Task 4 reorganizing `src/lsp/*`, `src/tree-sitter/*`, `src/tool/*`) or when files are deleted (Task 5 removing `supi-tree-sitter/src/tool/handlers.ts` and `formatting.ts`), run `pnpm install` afterward to keep the workspace module graph consistent.

#### Test files and stale mock factories
When deleting source files (Task 4 reducing old `src/lsp/*` / `src/tree-sitter/*` / `src/tool/*` to forwarders or removing them; Task 5 deleting `handlers.ts` and `formatting.ts`), audit every test file with `vi.mock` references to the deleted path. Per CLAUDE.md: *Deleting a source file breaks every test with `vi.mock("../<file>")` referencing it.* After any file deletion, sweep all `__tests__/` directories in `supi-code-intelligence` and `supi-tree-sitter` for stale mock factories.

#### Task 6 documentation gate
Task 6 (docs update) is sequenced after Task 5, but the stale-reference grep check can only pass once Tasks 1–5 are fully complete. If forwarders or old paths are still present as compatibility shims, the grep check must account for those — adjust the grep pattern to accept forwarder references or whitelist known shim paths.

#### Substrate adapter state ownership
`workspace-session.ts` (Task 1) holds references to semantic/structural adapter state. `substrate/semantic/state.ts` and `substrate/structural/state.ts` (Task 4) own the adapter instances and lifecycle. Clarify during implementation: `workspace-session` stores a lightweight handle/reference to the adapter state; the `substrate/*/state.ts` modules own the actual instance lifecycle (init, teardown, capability publishing into `supi-code-runtime`).

#### Refactor module forwarders
`src/refactor/safety.ts` and `src/refactor/apply-workspace-edit.ts` move under `src/analysis/refactor/` in Task 3. Before reducing the old paths to forwarders, check whether any callers **outside** `supi-code-intelligence` (e.g. in `supi-lsp` tool overrides) import from these paths. If so, keep the forwarders until those callers are migrated.

#### Lower-level debug surfaces
`tree_sitter_query` and `tree_sitter_node_at` are also expert debug surfaces alongside `lsp_references`, `lsp_implementation`, and `tree_sitter_callees`. They stay available during this refactor — the non-goals list covers the explicit trio, but the same principle applies to all lower-level `lsp_*` and `tree_sitter_*` tools.
